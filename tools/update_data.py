#!/usr/bin/env python3
"""대구 도심 준신축 아파트 평형별(59·74·84㎡) 실거래가 왜곡 — 데이터 생성기.

국토교통부 실거래가 공개시스템(rt.molit.go.kr) 아파트 매매 내려받기 CSV를
직접 받아(로그인·API 키 불필요) 단지별 평형 통계를 계산하고,
웹앱이 읽는 data/apartments.json 을 만든다.

사용:
  python3 update_data.py                       # 최근 12개월 자동 수신 → data/apartments.json
  python3 update_data.py --period 2025-11-18 2026-11-17
  python3 update_data.py --csv 원본.csv        # 이미 받아 둔 CSV로 생성(네트워크 없이)
  python3 update_data.py --out data/apartments.json --csv-out raw.csv

규칙(초기조사 문서와 동일):
  - 대구광역시 7개 구(달성군·군위군 제외)
  - 건축년도 2017년 이후
  - 전용 55~66㎡ = 59형, 66~79㎡ = 74형, 79~92㎡ = 84형
  - 해제(취소) 신고 계약 제외, 1~2층 거래 제외
  - 대표값은 중앙값(만원)
"""
import argparse
import collections
import csv
import datetime
import http.cookiejar
import io
import json
import os
import statistics
import sys
import tempfile
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
GU = ["중구", "수성구", "남구", "달서구", "북구", "동구", "서구"]
MIN_YEAR = 2017
BASE_84 = 80.0     # 59/84 >= 80%  → 84 추천
BASE_59 = 70.0     # 59/84 <= 70%  → 59 추천
BASE_74 = 93.0     # 74/84 >= 93%  → 84 추천(74 대체)


# ---------------------------------------------------------------- 수집
def fetch(start, end, out_path):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA), ("Accept-Language", "ko-KR,ko;q=0.9")]
    op.open("https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=", timeout=40).read()
    form = {
        "srhThingNo": "A", "srhDelngSecd": "1", "srhAddrGbn": "1", "srhLfstsSecd": "1",
        "sidoNm": "대구광역시", "sggNm": "", "emdNm": "", "loadNm": "", "areaNm": "", "hsmpNm": "",
        "mobileAt": "", "srhNewRonSecd": "", "srhSidoCd": "27", "srhSggCd": "", "srhEmdCd": "",
        "srhLoadCd": "", "srhHsmpCd": "", "srhArea": "", "srhLrArea": "",
        "srhFromDt": start, "srhToDt": end, "srhFromAmount": "", "srhToAmount": "",
    }
    post = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(
        "https://rt.molit.go.kr/pt/xls/ptXlsCSVDown.do", data=post,
        headers={"Referer": "https://rt.molit.go.kr/pt/xls/xls.do?mobileAt=",
                 "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
    r = op.open(req, timeout=240)
    body = r.read()
    if r.headers.get("Content-Disposition"):
        with open(out_path, "wb") as f:
            f.write(body)
        return body
    raise RuntimeError("CSV 수신 실패: " + body[:300].decode("cp949", "replace"))


def default_period():
    end = datetime.date.today() - datetime.timedelta(days=1)   # 신고 지연 감안, 어제까지
    start = end - datetime.timedelta(days=364)                  # 최대 1년 제한
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------- 계산
def bucket(area):
    if 55 <= area < 66:
        return 59
    if 66 <= area < 79:
        return 74
    if 79 <= area < 92:
        return 84
    return None


def parse_rows(raw):
    txt = raw.decode("cp949", errors="replace")
    lines = txt.splitlines()
    hi = next((i for i, l in enumerate(lines) if l.startswith('"NO"')), None)
    if hi is None:
        raise RuntimeError("CSV 헤더(NO 컬럼)를 찾지 못했습니다")
    rdr = csv.reader(io.StringIO("\n".join(lines[hi:])))
    hdr = next(rdr)
    out = []
    for row in rdr:
        if len(row) < 20:
            continue
        d = dict(zip(hdr, row))
        try:
            area = float(d["전용면적(㎡)"])
            price = int(str(d["거래금액(만원)"]).replace(",", "").strip())
        except Exception:
            continue
        b = bucket(area)
        if not b:
            continue
        parts = d["시군구"].split()
        if len(parts) > 1 and parts[1] not in GU:
            continue
        name = d["단지명"].strip()
        if not name:
            continue
        floor_txt = (d["층"] or "").strip()
        floor = int(floor_txt) if floor_txt.isdigit() else 0
        ym = (d["계약년월"] or "").strip()
        day = (d["계약일"] or "").strip().zfill(2)
        try:
            ymd = f"{ym[:4]}-{ym[4:6]}-{day}"
            deal_date = datetime.date.fromisoformat(ymd)
        except Exception:
            ymd, deal_date = "", None
        out.append({
            "name": name, "bucket": b, "price": price, "area": area, "floor": floor,
            "floor_txt": floor_txt, "gu": parts[1] if len(parts) > 1 else "",
            "sgg": d["시군구"].strip(), "dong": parts[2] if len(parts) > 2 else "",
            "year": int(d["건축년도"]) if str(d["건축년도"]).isdigit() else 0,
            "cancelled": (d["해제사유발생일"] or "").strip() not in ("-", ""),
            "direct": (d["거래유형"] or "").strip() == "직거래",
            "ymd": ymd, "date": deal_date,
        })
    return out


def build_stats(rows, period_start, period_end, min_year=MIN_YEAR):
    end = datetime.date.fromisoformat(period_end)
    six_start = end - datetime.timedelta(days=182)

    g = collections.defaultdict(lambda: collections.defaultdict(list))
    info = {}
    for r in rows:
        if r["year"] and r["year"] < min_year:
            continue
        g[r["name"]][r["bucket"]].append(r)
        prev = info.get(r["name"])
        if prev is None or r["year"] > prev["year"]:
            info[r["name"]] = {"gu": r["gu"], "dong": r["dong"], "sgg": r["sgg"], "year": r["year"]}

    stats = {}
    for name, buckets in g.items():
        meta = info[name]
        rec = {"name": name, **meta, "59": None, "74": None, "84": None}
        for b in (59, 74, 84):
            arr = buckets.get(b, [])
            if not arr:
                continue
            used = [r for r in arr if not r["cancelled"] and r["floor"] > 2]
            if not used:
                continue
            prices = [r["price"] for r in used]
            recent = [r for r in used if r["date"] and r["date"] >= six_start]
            recent_prices = [r["price"] for r in recent]
            last = max(used, key=lambda r: (r["date"] or datetime.date.min, r["price"]))
            med = int(round(statistics.median(prices)))
            mm = round(med / statistics.mean(r["area"] for r in used), 1)
            rec[str(b)] = {
                "n": len(used),
                "n_all": len(arr),
                "med": med,
                "mm": mm,
                "ex": sum(1 for r in arr if r["floor"] <= 2 and not r["cancelled"]),
                "direct": sum(1 for r in used if r["direct"]),
                "cancel": sum(1 for r in arr if r["cancelled"]),
                "n6": len(recent),
                "med6": int(round(statistics.median(recent_prices))) if recent_prices else None,
                "last": (f"{last['ymd'].replace('-', '.')} {last['floor_txt']}층 "
                         f"{last['price']:,}만" if last["ymd"] else f"{last['price']:,}만"),
                "last_price": last["price"],
                "last_ymd": last["ymd"],
                "last_floor": last["floor"],
            }
        stats[name] = rec
    return stats


def ratio(a, b):
    if not a or not b or not a["med"] or not b["med"]:
        return None
    return round(a["med"] / b["med"] * 100, 1)


def decorate(stats, period_start, period_end, raw_rows=None):
    """판정·비율·기준선을 붙여 웹앱용 items 를 만든다."""
    items = []
    for name, s in stats.items():
        a59, a74, a84 = s.get("59"), s.get("74"), s.get("84")
        r59 = ratio(a59, a84)
        r74 = ratio(a74, a84)
        r59_6 = ratio({**a59, "med": a59["med6"]} if a59 and a59.get("med6") else None,
                      {**a84, "med": a84["med6"]} if a84 and a84.get("med6") else None)
        r74_6 = ratio({**a74, "med": a74["med6"]} if a74 and a74.get("med6") else None,
                      {**a84, "med": a84["med6"]} if a84 and a84.get("med6") else None)

        if r59 is not None:
            basis, r = "59/84", r59
            verdict = "84" if r >= BASE_84 else ("59" if r <= BASE_59 else "watch")
            diff = a84["med"] - a59["med"]
            sample_pairs = [a59["n"], a84["n"]]
        elif r74 is not None:
            basis, r = "74/84", r74
            verdict = "84" if r >= BASE_74 else "watch"
            diff = a84["med"] - a74["med"]
            sample_pairs = [a74["n"], a84["n"]]
        else:
            basis = r = None
            verdict = "na"
            diff = None
            sample_pairs = [x["n"] for x in (a59, a74, a84) if x]

        thin = min(sample_pairs) if sample_pairs else 0
        sample = "high" if thin >= 10 else ("mid" if thin >= 3 else "low")
        verdict_raw = verdict
        if verdict in ("84", "59") and thin < 3:
            verdict = "thin"      # 비교한 두 평형 중 하나가 3건 미만 → 추천 보류
        items.append({
            "name": name, "gu": s["gu"], "dong": s["dong"], "sgg": s["sgg"], "year": s["year"],
            "a59": a59, "a74": a74, "a84": a84,
            "basis": basis, "ratio": r, "ratio6": r59_6 if basis == "59/84" else r74_6,
            "r59_84": r59, "r74_84": r74,
            "diff": diff, "verdict": verdict, "verdict_raw": verdict_raw, "sample": sample,
            "trades": sum(x["n"] for x in (a59, a74, a84) if x),
        })

    # 시장 기준선: 세 평형이 모두 3건 이상인 단지의 비율 중앙값 (초기조사와 같은 방식)
    full = [i for i in items if i["a59"] and i["a74"] and i["a84"]
            and min(i["a59"]["n"], i["a74"]["n"], i["a84"]["n"]) >= 3 and i["r59_84"]]
    base59 = round(statistics.median(i["r59_84"] for i in full), 1) if full else 75.1
    full74 = [i for i in items if i["a59"] and i["a74"] and i["a84"]
              and min(i["a59"]["n"], i["a74"]["n"], i["a84"]["n"]) >= 3 and i["r74_84"]]
    base74 = round(statistics.median(i["r74_84"] for i in full74), 1) if full74 else 88.6

    counts = collections.Counter(i["verdict"] for i in items)
    return {
        "meta": {
            "generated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
                            .isoformat(timespec="seconds"),
            "period_start": period_start,
            "period_end": period_end,
            "source": "국토교통부 실거래가 공개시스템(rt.molit.go.kr) 아파트 매매 내려받기 원자료",
            "region": "대구광역시 중구·수성구·남구·달서구·북구·동구·서구",
            "criteria": "준공 2017년 이후 · 전용 55~92㎡ · 해제계약과 1~2층 거래 제외 · 평형별 중앙값",
            "raw_count": raw_rows,
            "complex_count": len(items),
            "baselines": {"r59_84": base59, "r74_84": base74, "sample_n": len(full)},
            "thresholds": {"r59_84_high": BASE_84, "r59_84_low": BASE_59, "r74_84_high": BASE_74},
            "verdict_counts": {k: counts.get(k, 0) for k in ("84", "59", "watch", "thin", "na")},
        },
        "items": sorted(items, key=lambda i: (i["r59_84"] is None, -(i["r59_84"] or 0))),
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="이미 받아 둔 원자료 CSV 경로(지정 시 네트워크 미사용)")
    ap.add_argument("--period", nargs=2, metavar=("START", "END"), help="계약일 범위 YYYY-MM-DD")
    ap.add_argument("--out", default=os.path.join(root, "data", "apartments.json"))
    ap.add_argument("--csv-out", default=os.path.join(root, "data", "raw.csv"))
    ap.add_argument("--stats-out", help="단지별 원통계 JSON도 저장")
    args = ap.parse_args()

    start, end = args.period if args.period else default_period()
    if args.csv:
        with open(args.csv, "rb") as f:
            raw = f.read()
    else:
        fd, tmp = tempfile.mkstemp(suffix=".csv")
        os.close(fd)
        raw = fetch(start, end, tmp)
        try:
            os.replace(tmp, args.csv_out)
        except OSError:
            pass

    rows = parse_rows(raw)
    stats = build_stats(rows, start, end)
    if len(stats) < 50:
        raise RuntimeError(f"단지 수가 비정상적으로 적습니다({len(stats)}개) — 수집 결과를 확인하세요")
    data = decorate(stats, start, end, raw_rows=len(rows))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    if args.stats_out:
        with open(args.stats_out, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=1)

    m = data["meta"]
    print(f"# {m['period_start']} ~ {m['period_end']} / 원자료 {len(rows):,}건 / "
          f"단지 {m['complex_count']}개 / 기준선 59-84 {m['baselines']['r59_84']}% · "
          f"74-84 {m['baselines']['r74_84']}%")
    print(f"# 판정 84추천 {m['verdict_counts']['84']} · 59추천 {m['verdict_counts']['59']} · "
          f"관찰 {m['verdict_counts']['watch']} · 표본부족 {m['verdict_counts']['thin']} · "
          f"비교불가 {m['verdict_counts']['na']}")
    print(f"# 저장 {args.out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"오류: {e}", file=sys.stderr)
        sys.exit(1)
