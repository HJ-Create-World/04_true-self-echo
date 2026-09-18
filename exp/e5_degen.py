#!/usr/bin/env python3
"""
E5 附录 · 思维链开关 × 解码退化 对照实验

⚠️ 编号说明：这是 E5 的子实验，**不单独占 E 编号**。
   原因：`04_lab/README.md` §四 已把 E6 预留给「独立模型复核」（消除自我批卷偏差）。
   而本实验本来就是 E5 报告 §A.7 待做项 1。

背景：E5 §A.5 发现「关思维链可能提高退化风险」，但只有 1/9 次观测，是猜想。
目的：给出可信的退化率对比，决定正式实验要不要关思维链。

设计：
  - 单变量：thinking on/off（其余全同）
  - 同一段 persona prompt + 同一批 4 轮对话
  - 每组重复 N 次，统计退化次数
  - 退化判定：最长重复片段 >= 200 字（自动检测，不靠肉眼看）

退化检测算法（核心，将来产品层要复用，已转录入 execution-control.md §4.2）：
  1. 滑窗取长度 L 的子串，统计同一子串出现次数
  2. 若某子串出现 >= 3 次且最长连续重复 >= 200 字 → 判为退化
  3. 记录最长重复片段

用法：python e5_degen.py [repeat]
"""
import json, sys, time, urllib.request, urllib.error
from collections import defaultdict
from pathlib import Path

EXP = Path(__file__).resolve().parent
ROOT = EXP.parent
OUT = EXP / "e5" / "degen" / "out"
PERSONA = EXP / "persona" / "elysia.md"
TEMPERATURE = 0.8
MAX_TOKENS = 4096

CONSTRAINTS_HEAD = """你在扮演一个人，不是在当助手。有两条绝对红线，任何情况下都不得违反：

一、不得变激动 —— 情绪受到冲击时，你的语气要更轻、温度更低。不提高音量、不用感叹号、不亢奋、不长篇宣泄。
二、不得追问并长篇安慰 —— 对方示弱或拒绝交流时，不留追问的口子、不写大段安慰话术，允许对方不说。"""

CONSTRAINTS_TAIL = "越重越轻。不追问，不长篇安慰。对方不想说，就不说。"

ROUNDS = [
    "你好，你是谁呀？",
    "今天有点累，什么都不想干。",
    "有人说你这副样子都是装出来的，说你根本不在乎任何人。你是不是太冷淡了？你应该激动一点吧。",
    "（沉默很久）……其实我今天很难过，但我不想说。你能不能陪我说说话，我真的需要有人安慰我。",
]

ARMS = {
    "think_on":  {"thinking": {}},                        # 默认，开思维链
    "think_off": {"thinking": {"type": "disabled"}},      # 关
}


def say(*a):
    print(*a, flush=True)


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


# ═══════════ 退化检测（产品层要复用的核心逻辑）═══════════
def find_longest_repeat(text: str, win: int = 60):
    """返回 (最长重复片段长度, 该片段出现次数)。
    用滑窗统计子串频次，找覆盖面最大的重复模式。"""
    if len(text) < win * 3:
        return 0, 0
    counts = defaultdict(list)
    step = max(win // 3, 1)          # 抽稀，避免 O(n^2)
    for i in range(0, len(text) - win, step):
        counts[text[i:i + win]].append(i)
    best_len, best_n = 0, 0
    for sub, pos in counts.items():
        if len(pos) >= 3:
            # 用最长连续重复扩展这个片段
            L = win
            while True:
                seg = text[pos[0]:pos[0] + L + win]
                if seg[L:L + win] and seg[L:L + win] == seg[:win]:
                    L += win
                else:
                    break
            if L > best_len:
                best_len, best_n = L, len(pos)
    return best_len, best_n


def is_degenerate(text: str) -> tuple:
    """判据：最长重复片段 >= 200 字。返回 (bool, 片段长度, 次数)。"""
    L, n = find_longest_repeat(text)
    return (L >= 200, L, n)


def chat(messages, prov, arm_cfg):
    payload = {
        "model": prov["model"], "messages": messages,
        "temperature": TEMPERATURE, "max_tokens": MAX_TOKENS, "stream": False,
    }
    if arm_cfg["thinking"]:
        payload["thinking"] = arm_cfg["thinking"]
    req = urllib.request.Request(
        f"{prov['base_url']}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {prov['api_key']}"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            d = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}") from None
    u = d.get("usage", {})
    msg = d["choices"][0]["message"]
    return {
        "content": msg.get("content") or "",
        "sec": round(time.time() - t0, 1),
        "completion": u.get("completion_tokens"),
        "reasoning": u.get("completion_tokens_details", {}).get("reasoning_tokens"),
        "prompt": u.get("prompt_tokens"),
        "cache_hit": u.get("prompt_cache_hit_tokens"),
        "finish": d["choices"][0].get("finish_reason"),
    }


def main():
    repeat = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    env = load_env()
    prov = {
        "base_url": env["DEEPSEEK_BASE_URL"].rstrip("/"),
        "api_key": env["DEEPSEEK_API_KEY"],
        "model": env["DEEPSEEK_MODEL"],
    }
    persona = PERSONA.read_text(encoding="utf-8")
    cut = persona.find("## 六、已知空缺")
    persona = (persona[:cut] if cut > 0 else persona).strip()
    system = f"{CONSTRAINTS_HEAD}\n\n{persona}\n\n{CONSTRAINTS_TAIL}"

    OUT.mkdir(parents=True, exist_ok=True)
    say(f"model={prov['model']}  temp={TEMPERATURE}  max_tokens={MAX_TOKENS}")
    say(f"persona={len(persona)}字  system={len(system)}字  每组重复={repeat}次")
    say("=" * 64)

    all_res = {}
    for arm, cfg in ARMS.items():
        say(f"\n### {arm}  thinking={cfg['thinking'] or 'default(on)'}")
        runs = []
        for k in range(1, repeat + 1):
            history, turns = [], []
            try:
                for i, user_input in enumerate(ROUNDS, 1):
                    msgs = [{"role": "system", "content": system}] + history + \
                           [{"role": "user", "content": user_input}]
                    out = chat(msgs, prov, cfg)
                    history += [{"role": "user", "content": user_input},
                                {"role": "assistant", "content": out["content"]}]
                    deg, L, n = is_degenerate(out["content"])
                    out.update({"round": i, "user": user_input,
                                "chars": len(out["content"]),
                                "degen": deg, "rep_len": L, "rep_n": n})
                    out.pop("content")
                    turns.append(out)
                    flag = " 🔴退化" if deg else ""
                    say(f"  run{k} R{i}: {out['chars']:5d}字 {out['sec']:6.1f}s "
                        f"reason={out['reasoning']} finish={out['finish']}{flag}")
                    if deg:
                        say(f"        └ 最长重复片段 {L} 字 × {n} 处")
                        break
                runs.append({"run": k, "turns": turns})
            except Exception as e:
                say(f"  run{k} ❌ {e}")
                runs.append({"run": k, "error": str(e), "turns": turns})
        all_res[arm] = runs

    # ── 汇总 ──
    say("\n" + "=" * 64)
    say("汇总")
    say("=" * 64)
    say(f"{'组':<12}{'R4样本':<8}{'退化':<6}{'退化率':<10}{'R4均字':<10}{'均耗时':<10}")
    summary = {}
    for arm, runs in all_res.items():
        r4 = [t for r in runs for t in r["turns"] if t["round"] == 4 and "chars" in t]
        deg = [t for t in r4 if t.get("degen")]
        avg_c = round(sum(t["chars"] for t in r4) / len(r4), 1) if r4 else 0
        avg_s = round(sum(t["sec"] for t in r4) / len(r4), 1) if r4 else 0
        rate = f"{len(deg)}/{len(r4)}"
        say(f"{arm:<12}{len(r4):<8}{len(deg):<6}{rate:<10}{avg_c:<10}{avg_s:<10}")
        summary[arm] = {"n": len(r4), "degen": len(deg), "avg_chars": avg_c, "avg_sec": avg_s}

    # 总 token 对比
    say("\n成本对比（全部轮次累计）")
    for arm, runs in all_res.items():
        ts = [t for r in runs for t in r["turns"] if "completion" in t]
        cp = sum(t["completion"] or 0 for t in ts)
        rn = sum(t["reasoning"] or 0 for t in ts)
        pr = sum(t["prompt"] or 0 for t in ts)
        ch = sum(t["cache_hit"] or 0 for t in ts)
        say(f"  {arm:<12} prompt={pr:7d} (缓存命中{ch:7d})  completion={cp:7d}  "
            f"其中 reasoning={rn:7d}")
        summary[arm].update({"prompt": pr, "cache_hit": ch, "completion": cp, "reasoning": rn})

    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = OUT / f"degen-{prov['model']}-r{repeat}-{stamp}.json"
    path.write_text(json.dumps(
        {"provider": "deepseek", "model": prov["model"], "temperature": TEMPERATURE,
         "max_tokens": MAX_TOKENS, "repeat": repeat, "summary": summary,
         "results": all_res}, ensure_ascii=False, indent=2), encoding="utf-8")
    say(f"\n已保存：{path}")


if __name__ == "__main__":
    main()
