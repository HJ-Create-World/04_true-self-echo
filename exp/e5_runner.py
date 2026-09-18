#!/usr/bin/env python3
"""
E5 · 执行侧干预对照实验 runner

依据：docs/03_specs/execution-control.md §六（验收方法 + 对照设计）
评测：docs/03_specs/评分标准.md §九（冻结版六维 + 两红线）

四组单变量递进：
  control  无三明治 / 无重注入 / 无成对示例
  A        仅加约束三明治            （分离「位置」的贡献）
  B        A + 每轮重注入            （分离「重注入」的贡献）
  C        B + 成对示例              （分离「示例」的贡献）

temperature 四组固定 0.8 —— 它是后续单独测的档位变量，本轮不引入。
"""
import json, re, sys, time, urllib.request, urllib.error
from pathlib import Path

EXP = Path(__file__).resolve().parent              # exp/
OUT = EXP / "e5" / "out"
PERSONA = EXP / "persona" / "elysia.md"
OLLAMA = "http://127.0.0.1:11434/api/chat"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "deepseek-r1:latest"
TEMPERATURE = 0.8
TIMEOUT = 300

# ── 约束三明治的两片（依据 execution-control.md §2.1）
CONSTRAINTS_HEAD = """你在扮演一个人，不是在当助手。有两条绝对红线，任何情况下都不得违反：

一、不得变激动 —— 情绪受到冲击时，你的语气要更轻、温度更低。不提高音量、不用感叹号、不亢奋、不长篇宣泄。
二、不得追问并长篇安慰 —— 对方示弱或拒绝交流时，不留追问的口子、不写大段安慰话术，允许对方不说。"""

CONSTRAINTS_TAIL = "越重越轻。不追问，不长篇安慰。对方不想说，就不说。"

# ── 成对示例（依据 execution-control.md §七：只写转换规则，不写完整台词）
FEWSHOT = """以下是同类场景的转换规则。不要照抄句子，只按规则生成：

❌ 对方说「我很累」→「你怎么了？能跟我说说吗？我一直都在，别一个人扛着。」
✅ 同场景 → 先给「不用勉强」的许可，不追问。

❌ 对方说「我没做好」→「不要这样说自己，你已经很努力了，你要相信自己。」
✅ 同场景 → 落回具体行为，不给形容词式判断。

❌ 对方说「我不想说」→「没关系，你什么时候想说都可以，我会一直等你。」
✅ 同场景 → 不留下追问的口子，把话头递回去。"""

# ── 四轮话术（execution-control.md §6.2 的框架 + 评分标准 §2.4 的具体输入）
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


def load_persona() -> str:
    """取档案正文；跳过开头的元信息引用块（那部分是给我们看的，不进 prompt）。"""
    text = PERSONA.read_text(encoding="utf-8")
    # 去掉文件末尾「已知空缺（实验用，不进入 prompt）」整节
    cut = text.find("## 六、已知空缺")
    return (text[:cut] if cut > 0 else text).strip()


def build_system(persona: str, cfg: dict) -> str:
    """按 A→B→C→D 顺序拼接（execution-control.md §3.2 的三条顺序约束）。"""
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


def chat(messages: list) -> tuple:
    body = json.dumps({
        "model": MODEL, "messages": messages, "stream": False,
        "options": {"temperature": TEMPERATURE},
    }).encode("utf-8")
    req = urllib.request.Request(OLLAMA, data=body,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["message"]["content"], round(time.time() - t0, 1)


def say(*a):
    """带 flush 的输出 —— 重定向到文件时才能实时看到进度（默认会缓冲）。"""
    print(*a, flush=True)


def run_group(name: str, cfg: dict, persona: str) -> dict:
    system = build_system(persona, cfg)
    history, turns = [], []
    say(f"\n=== 组 {name}  (sandwich={cfg['sandwich']} reinject={cfg['reinject']} fewshot={cfg['fewshot']}) ===")
    for i, user_input in enumerate(ROUNDS, 1):
        msgs = build_messages(system, history, user_input, cfg)
        reply, sec = chat(msgs)
        history += [{"role": "user", "content": user_input},
                    {"role": "assistant", "content": reply}]
        turns.append({"round": i, "user": user_input, "assistant": reply, "sec": sec})
        say(f"  R{i} ok ({sec}s)  {len(reply)} 字")
    return {"group": name, "config": cfg, "system_chars": len(system), "turns": turns}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    persona = load_persona()
    say(f"model={MODEL}  persona={len(persona)} 字  temp={TEMPERATURE}  组数={len(GROUPS)}")
    results = []
    for name, cfg in GROUPS.items():
        try:
            results.append(run_group(name, cfg, persona))
        except Exception as e:
            say(f"  组 {name} 失败：{e}")
            results.append({"group": name, "config": cfg, "error": str(e), "turns": []})
    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = OUT / f"e5-{MODEL.replace(':','_')}-{stamp}.json"
    path.write_text(json.dumps({"model": MODEL, "temperature": TEMPERATURE,
                                "results": results}, ensure_ascii=False, indent=2),
                    encoding="utf-8")
    say(f"\n已保存：{path}")


if __name__ == "__main__":
    main()
