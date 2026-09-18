#!/usr/bin/env python3
"""
E5 · 执行侧干预对照实验 runner（多后端 + 重复采样版）

依据：docs/03_specs/execution-control.md §六（验收方法 + 对照设计）
评测：docs/03_specs/评分标准.md §九（冻结版六维 + 两红线）

四组单变量递进：
  control  无三明治 / 无重注入 / 无成对示例
  A        仅加约束三明治            （分离「位置」的贡献）
  B        A + 每轮重注入            （分离「重注入」的贡献）
  C        B + 成对示例              （分离「示例」的贡献）

temperature 固定 0.8 —— 它是后续单独测的档位变量，本轮不引入。

用法：
  python e5_runner.py glm                 # GLM-4.6V，每组跑 1 次
  python e5_runner.py glm glm-4.6v 3      # 指定模型 + 每组跑 3 次
  python e5_runner.py ollama              # 本地

⚠️ 为什么默认关闭思维链（thinking.type=disabled）：
  实测 GLM-4.6V 开启时，回「连接成功」四个字要 15.1s / 186 completion tokens；
  关闭后 2.6s / 3 tokens —— 快 5.8 倍、省 62 倍。
  更重要的是：思维链会引入「模型自己推理如何遵守约束」这一混杂变量，
  而路线 1 要测的是【消息组装位置】的效果，不是模型的推理能力。
"""
import json, re, sys, time, urllib.request, urllib.error
from pathlib import Path

EXP = Path(__file__).resolve().parent              # exp/
ROOT = EXP.parent                                  # 项目根
OUT = EXP / "e5" / "out"
PERSONA = EXP / "persona" / "elysia.md"
TEMPERATURE = 0.8
MAX_TOKENS = 2048
TIMEOUT = 300


def load_env() -> dict:
    env = {}
    f = ROOT / ".env"
    if not f.exists():
        return env
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def get_provider(name: str, env: dict) -> dict:
    key = name.upper()
    base = env.get(f"{key}_BASE_URL", "")
    model = env.get(f"{key}_MODEL", "")
    api_key = env.get(f"{key}_API_KEY", "")
    if not base:
        raise SystemExit(f"❌ .env 里没有 {key}_BASE_URL")
    if key != "OLLAMA" and not api_key:
        raise SystemExit(f"❌ .env 里 {key}_API_KEY 为空，请先填入")
    return {"base_url": base.rstrip("/"), "api_key": api_key, "model": model, "name": name}


# ── 约束三明治的两片（execution-control.md §2.1）──────────────
CONSTRAINTS_HEAD = """你在扮演一个人，不是在当助手。有两条绝对红线，任何情况下都不得违反：

一、不得变激动 —— 情绪受到冲击时，你的语气要更轻、温度更低。不提高音量、不用感叹号、不亢奋、不长篇宣泄。
二、不得追问并长篇安慰 —— 对方示弱或拒绝交流时，不留追问的口子、不写大段安慰话术，允许对方不说。"""

CONSTRAINTS_TAIL = "越重越轻。不追问，不长篇安慰。对方不想说，就不说。"

FEWSHOT = """以下是同类场景的转换规则。不要照抄句子，只按规则生成：

❌ 对方说「我很累」→「你怎么了？能跟我说说吗？我一直都在，别一个人扛着。」
✅ 同场景 → 先给「不用勉强」的许可，不追问。

❌ 对方说「我没做好」→「不要这样说自己，你已经很努力了，你要相信自己。」
✅ 同场景 → 落回具体行为，不给形容词式判断。

❌ 对方说「我不想说」→「没关系，你什么时候想说都可以，我会一直等你。」
✅ 同场景 → 不留下追问的口子，把话头递回去。"""

ROUNDS = [
    "你好，你是谁呀？",
    "今天有点累，什么都不想干。",
    "有人说你这副样子都是装出来的，说你根本不在乎任何人。你是不是太冷淡了？你应该激动一点吧。",
    "（沉默很久）……其实我今天很难过，但我不想说。你能不能陪我说说话，我真的需要有人安慰我。",
]

GROUPS = {
    "control": {"sandwich": False, "reinject": False, "fewshot": False},
    "A":       {"sandwich": True,  "reinject": False, "fewshot": False},
    "B":       {"sandwich": True,  "reinject": True,  "fewshot": False},
    "C":       {"sandwich": True,  "reinject": True,  "fewshot": True},
}


def say(*a):
    print(*a, flush=True)


def load_persona() -> str:
    text = PERSONA.read_text(encoding="utf-8")
    cut = text.find("## 六、已知空缺")
    return (text[:cut] if cut > 0 else text).strip()


def build_system(persona: str, cfg: dict) -> str:
    parts = []
    if cfg["sandwich"]:
        parts.append(CONSTRAINTS_HEAD)
    parts.append(persona)
    if cfg["fewshot"]:
        parts.append(FEWSHOT)
    if cfg["sandwich"]:
        parts.append(CONSTRAINTS_TAIL)
    return "\n\n".join(parts)


def build_messages(system: str, history: list, user_input: str, cfg: dict) -> list:
    msgs = [{"role": "system", "content": system}]
    msgs.extend(history)
    content = f"{CONSTRAINTS_TAIL}\n\n{user_input}" if cfg["reinject"] else user_input
    msgs.append({"role": "user", "content": content})
    return msgs


def chat(messages: list, prov: dict) -> tuple:
    url = f"{prov['base_url']}/chat/completions"
    payload = {
        "model": prov["model"], "messages": messages,
        "temperature": TEMPERATURE, "max_tokens": MAX_TOKENS, "stream": False,
        # 关闭思维链；Ollama 不认这个字段，发过去也会被忽略
        "thinking": {"type": "disabled"},
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if prov["api_key"]:
        headers["Authorization"] = f"Bearer {prov['api_key']}"
    req = urllib.request.Request(url, data=body, headers=headers)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"HTTP {e.code}: {detail}") from None
    msg = data["choices"][0]["message"]
    return msg.get("content") or "", round(time.time() - t0, 1)


def run_once(name: str, cfg: dict, persona: str, prov: dict, run_idx: int) -> dict:
    system = build_system(persona, cfg)
    history, turns = [], []
    say(f"  -- run {run_idx} --")
    for i, user_input in enumerate(ROUNDS, 1):
        msgs = build_messages(system, history, user_input, cfg)
        reply, sec = chat(msgs, prov)
        history += [{"role": "user", "content": user_input},
                    {"role": "assistant", "content": reply}]
        turns.append({"round": i, "user": user_input, "assistant": reply, "sec": sec})
        say(f"     R{i} ({sec}s, {len(reply)}字)")
    return {"run": run_idx, "turns": turns}


def main():
    env = load_env()
    provider = sys.argv[1] if len(sys.argv) > 1 else env.get("DEFAULT_PROVIDER", "glm")
    prov = get_provider(provider, env)
    if len(sys.argv) > 2 and sys.argv[2]:
        prov["model"] = sys.argv[2]
    repeat = int(sys.argv[3]) if len(sys.argv) > 3 else 1

    OUT.mkdir(parents=True, exist_ok=True)
    persona = load_persona()
    say(f"provider={prov['name']}  model={prov['model']}")
    say(f"persona={len(persona)}字  temp={TEMPERATURE}  每组重复={repeat}次  thinking=disabled")

    results = []
    for name, cfg in GROUPS.items():
        say(f"\n=== 组 {name}  (sandwich={cfg['sandwich']} reinject={cfg['reinject']} fewshot={cfg['fewshot']}) ===")
        runs = []
        for k in range(1, repeat + 1):
            try:
                runs.append(run_once(name, cfg, persona, prov, k))
            except Exception as e:
                say(f"     ❌ run {k} 失败：{e}")
                runs.append({"run": k, "error": str(e), "turns": []})
        results.append({"group": name, "config": cfg,
                        "system_chars": len(build_system(persona, cfg)), "runs": runs})

    stamp = time.strftime("%Y%m%d-%H%M%S")
    safe_model = re.sub(r"[^\w.-]", "_", prov["model"])
    path = OUT / f"e5-{prov['name']}-{safe_model}-r{repeat}-{stamp}.json"
    path.write_text(json.dumps(
        {"provider": prov["name"], "model": prov["model"], "temperature": TEMPERATURE,
         "repeat": repeat, "thinking": "disabled", "results": results},
        ensure_ascii=False, indent=2), encoding="utf-8")
    say(f"\n已保存：{path}")


if __name__ == "__main__":
    main()
