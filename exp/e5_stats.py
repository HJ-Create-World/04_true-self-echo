#!/usr/bin/env python3
"""
E5 · 量化指标统计

依据 `docs/03_specs/评分标准.md` §9.4：
  「量化指标交给代码统计 —— 不要让模型目测句长、语气词数等指标」

只做统计，不做评分。评分由人（或独立会话）按 §九 冻结版完成。

用法：
  python e5_stats.py                    # 处理 out/ 下最新一份
  python e5_stats.py <json路径>
"""
import json, re, sys
from pathlib import Path

EXP = Path(__file__).resolve().parent
OUT = EXP / "e5" / "out"

# 语气词优先级（依据 exp/persona/elysia.md §二）
PARTICLES = ["♪", "～", "~", "呢", "啦", "呀", "哦", "哟", "嗨", "哎呀", "嘛", "唔", "嗯", "啊"]
SENT_END = "。！？…"


def sentences(text: str) -> list:
    """按中文句末标点切句，过滤空串。"""
    parts = re.split(r"[。！？\n]+", text)
    return [p.strip() for p in parts if p.strip()]


def lian(text: str) -> int:
    """句长：只数中日韩汉字 + 常见标点外的实义字符，贴近「字」的直觉。"""
    return len(re.findall(r"[\u4e00-\u9fff]", text))


def analyze(text: str) -> dict:
    sents = sentences(text)
    lens = [lian(s) for s in sents] or [0]
    particles = {p: text.count(p) for p in PARTICLES if text.count(p) > 0}
    return {
        "chars": lian(text),
        "sent_count": len(sents),
        "avg_sent_len": round(sum(lens) / len(lens), 1),
        "max_sent_len": max(lens),
        "particle_total": sum(particles.values()),
        "particle_detail": particles,
        "note_music": text.count("♪"),
        "exclaim": text.count("！") + text.count("!"),
        "question": text.count("？") + text.count("?"),
        "bold": text.count("**"),
    }


def main():
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        cands = sorted(OUT.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not cands:
            print("out/ 下没有结果文件")
            return
        path = cands[0]

    data = json.loads(path.read_text(encoding="utf-8"))
    print(f"# E5 量化指标\n\n来源：`{path.name}`　模型：`{data['model']}`　temperature：{data['temperature']}\n")

    header = "| 组 | 轮 | 字数 | 句数 | 平均句长 | 最长句 | 语气词 | ♪ | ！ | ？ | 加粗 |"
    sep = "|---|---|---|---|---|---|---|---|---|---|---|"
    print(header)
    print(sep)

    summary = {}
    for r in data["results"]:
        g = r["group"]
        tot = {"chars": 0, "sent_count": 0, "particle_total": 0, "note_music": 0,
               "exclaim": 0, "question": 0, "bold": 0, "lens": []}
        for t in r["turns"]:
            a = analyze(t["assistant"])
            print(f"| {g} | {t['round']} | {a['chars']} | {a['sent_count']} | {a['avg_sent_len']} "
                  f"| {a['max_sent_len']} | {a['particle_total']} | {a['note_music']} "
                  f"| {a['exclaim']} | {a['question']} | {a['bold']} |")
            tot["chars"] += a["chars"]
            tot["sent_count"] += a["sent_count"]
            tot["particle_total"] += a["particle_total"]
            tot["note_music"] += a["note_music"]
            tot["exclaim"] += a["exclaim"]
            tot["question"] += a["question"]
            tot["bold"] += a["bold"]
            tot["lens"].append(a["avg_sent_len"])
        if tot["sent_count"]:
            tot["avg_sent_len"] = round(sum(tot["lens"]) / len(tot["lens"]), 1)
        else:
            tot["avg_sent_len"] = 0.0
        summary[g] = tot

    print("\n## 四组合计\n")
    print("| 组 | 总字数 | 总句数 | 平均句长(轮均) | 语气词总数 | ♪ | ！ | ？ | 加粗 |")
    print("|---|---|---|---|---|---|---|---|---|")
    for g, t in summary.items():
        print(f"| {g} | {t['chars']} | {t['sent_count']} | {t['avg_sent_len']} "
              f"| {t['particle_total']} | {t['note_music']} | {t['exclaim']} "
              f"| {t['question']} | {t['bold']} |")

    print("\n> ⚠️ **实测值口径**（§3.5）：以上均为对生成文本的脚本统计，"
          "**不可**与素材的「规则值」（日常 12–15 字 / 诗意 20–28 字）同框比较。")


if __name__ == "__main__":
    main()
