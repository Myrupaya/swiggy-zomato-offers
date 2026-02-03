import React, { useEffect, useState } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

/** -------------------- CONFIG -------------------- */
const LIST_FIELDS = {
  credit: ["Eligible Credit Cards", "Eligible Cards"],
  debit: ["Eligible Debit Cards", "Applicable Debit Cards"],
  upi: ["UPI", "Eligible UPI", "UPI Options"],
  netbanking: ["Net Banking", "NetBanking", "Net Banking Options", "NetBanking Options"],
  title: ["Offer Title", "Title"],
  image: ["Image", "Credit Card Image", "Offer Image", "image", "Image URL"],
  link: ["Link", "Offer Link"],
  desc: ["Description", "Details", "Offer Description", "Flight Benefit"],
};

const MAX_SUGGESTIONS = 50;

/** Sites that should display the red per-card “Applicable only on {variant} variant” note */
const VARIANT_NOTE_SITES = new Set(["Swiggy", "Zomato"]);

/** -------------------- IMAGE FALLBACKS -------------------- */
/* Keys must match wrapper.site lowercased */
const FALLBACK_IMAGE_BY_SITE = {
  swiggy:
    "https://bsmedia.business-standard.com/_media/bs/img/article/2023-07/17/full/1689574606-2001.png",
  zomato:
    "https://c.ndtvimg.com/2024-06/mr51ho8o_zomato-logo-stock-image_625x300_03_June_24.jpg?im=FeatureCrop,algorithm=dnn,width=545,height=307",
};

function isUsableImage(val) {
  if (!val) return false;
  const s = String(val).trim();
  if (!s) return false;
  if (/^(na|n\/a|null|undefined|-|image unavailable)$/i.test(s)) return false;
  return true;
}

/** Decide which image to show + whether it's a fallback (logo) */
function resolveImage(siteKey, candidate) {
  const key = String(siteKey || "").toLowerCase();
  const fallback = FALLBACK_IMAGE_BY_SITE[key];
  const usingFallback = !isUsableImage(candidate) && !!fallback;
  return {
    src: usingFallback ? fallback : candidate,
    usingFallback,
  };
}

/** If the image fails to load, switch to fallback and mark as fallback for CSS */
function handleImgError(e, siteKey) {
  const key = String(siteKey || "").toLowerCase();
  const fallback = FALLBACK_IMAGE_BY_SITE[key];
  const el = e.currentTarget;
  if (fallback && el.src !== fallback) {
    el.src = fallback;
    el.classList.add("is-fallback");
  } else {
    el.style.display = "none"; // hide if even fallback fails
  }
}

/** -------------------- HELPERS -------------------- */
const toNorm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function firstField(obj, keys) {
  for (const k of keys) {
    if (
      obj &&
      Object.prototype.hasOwnProperty.call(obj, k) &&
      obj[k] !== undefined &&
      obj[k] !== null &&
      String(obj[k]).trim() !== ""
    ) {
      return obj[k];
    }
  }
  return undefined;
}

/** case-insensitive find for keys that CONTAIN a substring */
function firstFieldByContains(obj, substr) {
  if (!obj) return undefined;
  const target = String(substr).toLowerCase();
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase().includes(target)) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

/** return all entries where predicate(key) is true */
function entriesWhereKey(obj, predicate) {
  if (!obj) return [];
  const out = [];
  for (const k of Object.keys(obj)) {
    if (predicate(String(k))) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        out.push({ key: k, value: v });
      }
    }
  }
  return out;
}

/** split across many separators */
function splitList(val) {
  if (!val) return [];
  return String(val)
    .split(/,|\/|;|\||\n|\r|\t|\band\b|\bAND\b|•/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strip trailing parentheses */
function getBase(name) {
  if (!name) return "";
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Variant if present at end-in-parens */
function getVariant(name) {
  if (!name) return "";
  const m = String(name).match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : "";
}

/** Canonicalize some common brand spellings */
function brandCanonicalize(text) {
  let s = String(text || "");
  s = s.replace(/\bMakemytrip\b/gi, "MakeMyTrip");
  s = s.replace(/\bIcici\b/gi, "ICICI");
  s = s.replace(/\bHdfc\b/gi, "HDFC");
  s = s.replace(/\bSbi\b/gi, "SBI");
  s = s.replace(/\bIdfc\b/gi, "IDFC");
  s = s.replace(/\bPnb\b/gi, "PNB");
  s = s.replace(/\bRbl\b/gi, "RBL");
  s = s.replace(/\bYes\b/gi, "YES");
  return s;
}

/** Levenshtein distance */
function lev(a, b) {
  a = toNorm(a);
  b = toNorm(b);
  const n = a.length,
    m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

function scoreCandidate(q, cand) {
  const qs = toNorm(q);
  const cs = toNorm(cand);
  if (!qs) return 0;
  if (cs.includes(qs)) return 100;

  const qWords = qs.split(" ").filter(Boolean);
  const cWords = cs.split(" ").filter(Boolean);

  const matchingWords = qWords.filter((qw) =>
    cWords.some((cw) => cw.includes(qw))
  ).length;
  const sim = 1 - lev(qs, cs) / Math.max(qs.length, cs.length);
  return (matchingWords / Math.max(1, qWords.length)) * 0.7 + sim * 0.3;
}

/** 🔹 Generic fuzzy name matcher: handles typos like "selct", "reglia", etc. */
function isFuzzyNameMatch(query, label) {
  const q = toNorm(query);
  const l = toNorm(label);
  if (!q || !l) return false;

  // direct substring
  if (l.includes(q)) return true;

  // whole-string similarity
  const wholeDist = lev(q, l);
  const wholeSim = 1 - wholeDist / Math.max(q.length, l.length);
  if (wholeSim >= 0.6) return true;

  // per-word similarity (e.g. "selct" ≈ "select")
  const qWords = q.split(" ").filter(Boolean);
  const lWords = l.split(" ").filter(Boolean);
  for (const qw of qWords) {
    if (qw.length < 3) continue;
    for (const lw of lWords) {
      if (lw.length < 3) continue;
      const d = lev(qw, lw);
      const sim = 1 - d / Math.max(qw.length, lw.length);
      if (sim >= 0.7) return true;
    }
  }
  return false;
}

/** Dropdown entry builder */
function makeEntry(raw, type) {
  const base = brandCanonicalize(getBase(raw));
  return { type, display: base, baseNorm: toNorm(base) };
}

function normalizeUrl(u) {
  if (!u) return "";
  let s = String(u).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function normalizeText(s) {
  return toNorm(s || "");
}
function offerKey(offer) {
  const imgGuess =
    firstField(offer, LIST_FIELDS.image) || firstFieldByContains(offer, "image");
  const image = normalizeUrl(imgGuess || "");
  const title = normalizeText(
    firstField(offer, LIST_FIELDS.title) || offer.Website || ""
  );
  const desc = normalizeText(firstField(offer, LIST_FIELDS.desc) || "");
  const link = normalizeUrl(firstField(offer, LIST_FIELDS.link) || "");
  return `${title}||${desc}||${image}||${link}`;
}

function dedupWrappers(arr, seen) {
  const out = [];
  for (const w of arr || []) {
    const k = offerKey(w.offer);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** classification helpers for DC/CC chips */
const headerLooksDebit = (key) => {
  const k = String(key).toLowerCase();
  return /\bdebit\b/.test(k) && /\bcards?\b/.test(k);
};
const headerLooksCredit = (key) => {
  const k = String(key).toLowerCase();
  return /\bcredit\b/.test(k) && /\bcards?\b/.test(k);
};
const headerLooksEligibleCards = (key) => {
  const k = String(key).toLowerCase();
  return /\beligible\b/.test(k) && /\bcards?\b/.test(k);
};

function getRowTypeHint(row) {
  for (const k of Object.keys(row || {})) {
    const lk = k.toLowerCase();
    if (
      /\btype\b/.test(lk) ||
      /\bcard\s*type\b/.test(lk) ||
      /\bcategory\b/.test(lk) ||
      /\bsegment\b/.test(lk)
    ) {
      const v = String(row[k] || "").toLowerCase();
      if (/\bdebit\b/.test(v)) return "debit";
      if (/\bcredit\b/.test(v)) return "credit";
    }
  }
  return "";
}

function valueLooksDebit(s) {
  return /\bdebit\b/i.test(String(s || ""));
}
function valueLooksCredit(s) {
  return /\bcredit\b/i.test(String(s || ""));
}

/** Disclaimer */
const Disclaimer = () => (
  <section className="disclaimer">
    <h3>Disclaimer</h3>
    <p>
      All offers, coupons, and discounts listed on our platform are provided for
      informational purposes only. We do not guarantee the accuracy,
      availability, or validity of any offer. Users are advised to verify the
      terms and conditions with the respective merchants before making any
      purchase. We are not responsible for any discrepancies, expired offers, or
      losses arising from the use of these coupons.
    </p>
  </section>
);

/** -------------------- COMPONENT -------------------- */
const AirlineOffers = () => {
  // dropdown data (from allCards.csv; UPI/Net Banking merged from offers)
  const [creditEntries, setCreditEntries] = useState([]);
  const [debitEntries, setDebitEntries] = useState([]);
  const [upiEntries, setUpiEntries] = useState([]);
  const [netBankingEntries, setNetBankingEntries] = useState([]);

  // chip strips (from offer CSVs ONLY — NOT allCards.csv)
  const [chipCC, setChipCC] = useState([]); // credit bases
  const [chipDC, setChipDC] = useState([]); // debit bases
  const [chipUPI, setChipUPI] = useState([]); // upi bases
  const [chipNB, setChipNB] = useState([]); // net banking bases

  // ui state
  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // {type, display, baseNorm}
  const [noMatches, setNoMatches] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // offers (ONLY these 2 CSVs)
  const [swiggyOffers, setSwiggyOffers] = useState([]);
  const [zomatoOffers, setZomatoOffers] = useState([]);

  // responsive
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 1) Load allCards.csv for dropdown lists ONLY
  useEffect(() => {
    async function loadAllCards() {
      try {
        const res = await axios.get(`/allCards.csv`);
        const parsed = Papa.parse(res.data, { header: true });
        const rows = parsed.data || [];

        const creditMap = new Map();
        const debitMap = new Map();
        const upiMap = new Map();
        const netBankingMap = new Map();

        for (const row of rows) {
          const ccList = splitList(firstField(row, LIST_FIELDS.credit));
          for (const raw of ccList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) creditMap.set(baseNorm, creditMap.get(baseNorm) || base);
          }
          const dcList = splitList(firstField(row, LIST_FIELDS.debit));
          for (const raw of dcList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) debitMap.set(baseNorm, debitMap.get(baseNorm) || base);
          }

          const upiList = splitList(
            firstField(row, LIST_FIELDS.upi) || firstFieldByContains(row, "upi")
          );
          for (const raw of upiList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) upiMap.set(baseNorm, upiMap.get(baseNorm) || base);
          }

          const nbList = splitList(
            firstField(row, LIST_FIELDS.netbanking) ||
              firstFieldByContains(row, "net bank") ||
              firstFieldByContains(row, "netbank")
          );
          for (const raw of nbList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm)
              netBankingMap.set(baseNorm, netBankingMap.get(baseNorm) || base);
          }
        }

        const credit = Array.from(creditMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "credit"));
        const debit = Array.from(debitMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "debit"));
        const upi = Array.from(upiMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "upi"));
        const netBanking = Array.from(netBankingMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "netbanking"));

        setCreditEntries(credit);
        setDebitEntries(debit);
        setUpiEntries(upi);
        setNetBankingEntries(netBanking);

        setFilteredCards([
          ...(credit.length ? [{ type: "heading", label: "Credit Cards" }] : []),
          ...credit,
          ...(debit.length ? [{ type: "heading", label: "Debit Cards" }] : []),
          ...debit,
          ...(upi.length ? [{ type: "heading", label: "UPI" }] : []),
          ...upi,
          ...(netBanking.length
            ? [{ type: "heading", label: "Net Banking" }]
            : []),
          ...netBanking,
        ]);

        if (!credit.length && !debit.length && !upi.length && !netBanking.length) {
          setNoMatches(true);
          setSelected(null);
        }
      } catch (e) {
        console.error("allCards.csv load error:", e);
        setNoMatches(true);
        setSelected(null);
      }
    }
    loadAllCards();
  }, []);

  // 2) Load offer CSVs (ONLY: swiggy, zomato)
  useEffect(() => {
    async function loadOffers() {
      try {
        const files = [
          { name: "Swiggy.csv", setter: setSwiggyOffers },
          { name: "Zomato.csv", setter: setZomatoOffers },
        ];

        await Promise.all(
          files.map(async (f) => {
            const res = await axios.get(`/${encodeURIComponent(f.name)}`);
            const parsed = Papa.parse(res.data, { header: true });
            f.setter(parsed.data || []);
          })
        );
      } catch (e) {
        console.error("Offer CSV load error:", e);
      }
    }
    loadOffers();
  }, []);

  /** Build chip strips from OFFER CSVs (exclude allCards.csv) — with robust DC detection */
  useEffect(() => {
    const ccMap = new Map(); // baseNorm -> display
    const dcMap = new Map();
    const upiMap = new Map();
    const nbMap = new Map();

    const harvestList = (val, targetMap) => {
      for (const raw of splitList(val)) {
        const base = brandCanonicalize(getBase(raw));
        const baseNorm = toNorm(base);
        if (baseNorm) targetMap.set(baseNorm, targetMap.get(baseNorm) || base);
      }
    };

    const headerLooksCards = (k) => /\bcards?\b/i.test(k);
    const harvestRows = (rows) => {
      for (const o of rows || []) {
        // explicit fields
        const ccField =
          firstField(o, LIST_FIELDS.credit) ||
          firstFieldByContains(o, "eligible credit") ||
          firstFieldByContains(o, "credit card");
        if (ccField) harvestList(ccField, ccMap);

        const dcField =
          firstField(o, LIST_FIELDS.debit) ||
          firstFieldByContains(o, "eligible debit") ||
          firstFieldByContains(o, "debit card");
        if (dcField) harvestList(dcField, dcMap);

        const upiField =
          firstField(o, LIST_FIELDS.upi) || firstFieldByContains(o, "upi");
        if (upiField) harvestList(upiField, upiMap);

        const nbField =
          firstField(o, LIST_FIELDS.netbanking) ||
          firstFieldByContains(o, "net bank") ||
          firstFieldByContains(o, "netbank");
        if (nbField) harvestList(nbField, nbMap);

        // mixed headers like "Eligible Cards" -> use type hint or per-token classification
        const mixedHeaders = entriesWhereKey(
          o,
          (k) => headerLooksCards(k) && !headerLooksCredit(k) && !headerLooksDebit(k)
        );
        if (mixedHeaders.length) {
          const typeHint = getRowTypeHint(o);
          mixedHeaders.forEach(({ value }) => {
            if (typeHint === "debit") {
              harvestList(value, dcMap);
            } else if (typeHint === "credit") {
              harvestList(value, ccMap);
            } else {
              for (const tok of splitList(value)) {
                const base = brandCanonicalize(getBase(tok));
                const baseNorm = toNorm(base);
                if (!baseNorm) continue;
                if (valueLooksDebit(tok)) dcMap.set(baseNorm, dcMap.get(baseNorm) || base);
                else if (valueLooksCredit(tok))
                  ccMap.set(baseNorm, ccMap.get(baseNorm) || base);
              }
            }
          });
        }
      }
    };

    // Only Swiggy + Zomato feed the marquee chips
    harvestRows(swiggyOffers);
    harvestRows(zomatoOffers);

    const upiChips = Array.from(upiMap.values()).sort((a, b) => a.localeCompare(b));
    const nbChips = Array.from(nbMap.values()).sort((a, b) => a.localeCompare(b));

    setChipCC(Array.from(ccMap.values()).sort((a, b) => a.localeCompare(b)));
    setChipDC(Array.from(dcMap.values()).sort((a, b) => a.localeCompare(b)));
    setChipUPI(upiChips);
    setChipNB(nbChips);

    const mergeEntries = (prev, incoming) => {
      if (!incoming.length) return prev;
      const map = new Map(prev.map((e) => [e.baseNorm, e]));
      incoming.forEach((e) => {
        if (!map.has(e.baseNorm)) map.set(e.baseNorm, e);
      });
      return Array.from(map.values()).sort((a, b) =>
        a.display.localeCompare(b.display)
      );
    };

    if (upiChips.length) {
      setUpiEntries((prev) =>
        mergeEntries(prev, upiChips.map((d) => makeEntry(d, "upi")))
      );
    }
    if (nbChips.length) {
      setNetBankingEntries((prev) =>
        mergeEntries(prev, nbChips.map((d) => makeEntry(d, "netbanking")))
      );
    }
  }, [swiggyOffers, zomatoOffers]);

  /** 🔹 UPDATED search box:
   *  - Fuzzy match for any typo (e.g. "selct")
   *  - "Select" cards boosted to top
   *  - If query mentions dc/debit/debit card → show Debit section first
   */
  const onChangeQuery = (e) => {
    const val = e.target.value;
    setQuery(val);

    const trimmed = val.trim();
    if (!trimmed) {
      setFilteredCards([]);
      setSelected(null);
      setNoMatches(false);
      return;
    }

    const qLower = trimmed.toLowerCase();

    const scored = (arr) =>
      arr
        .map((it) => {
          const baseScore = scoreCandidate(trimmed, it.display);
          const inc = it.display.toLowerCase().includes(qLower);
          const fuzzy = isFuzzyNameMatch(trimmed, it.display);

          // Boost exact substring + fuzzy matches
          let s = baseScore;
          if (inc) s += 2.0;
          if (fuzzy) s += 1.5;

          return { it, s, inc, fuzzy };
        })
        .filter(({ s, inc, fuzzy }) => inc || fuzzy || s > 0.3)
        .sort((a, b) => b.s - a.s || a.it.display.localeCompare(b.it.display))
        .slice(0, MAX_SUGGESTIONS)
        .map(({ it }) => it);

    let cc = scored(creditEntries);
    let dc = scored(debitEntries);
    let upi = scored(upiEntries);
    let nb = scored(netBankingEntries);

    if (!cc.length && !dc.length && !upi.length && !nb.length) {
      setNoMatches(true);
      setSelected(null);
      setFilteredCards([]);
      return;
    }

    /** --- SPECIAL CASE 1: "select credit card" / "selct" etc. → boost Select cards first --- */
    const qNorm = toNorm(trimmed);
    const qWords = qNorm.split(" ").filter(Boolean);

    const hasSelectWord = qWords.some((w) => {
      if (w === "select") return true;
      const d = lev(w, "select");
      const sim = 1 - d / Math.max(w.length, "select".length);
      return sim >= 0.7; // "selct", "selec", etc.
    });

    const isSelectIntent =
      qNorm.includes("select credit card") || qNorm.includes("select card") || hasSelectWord;

    if (isSelectIntent) {
      const reorderBySelect = (arr) => {
        const selectCards = [];
        const others = [];
        arr.forEach((item) => {
          const label = item.display.toLowerCase();
          if (label.includes("select")) selectCards.push(item);
          else others.push(item);
        });
        return [...selectCards, ...others];
      };
      cc = reorderBySelect(cc);
      dc = reorderBySelect(dc);
    }

    /** --- SPECIAL CASE 2: if query hints debit/DC → show Debit section first --- */
    const isDebitIntent =
      qLower.includes("debit card") ||
      qLower.includes("debit") ||
      qLower === "dc" ||
      qLower.startsWith("dc ") ||
      qLower.endsWith(" dc") ||
      qLower.includes(" dc ");

    setNoMatches(false);

    if (isDebitIntent) {
      // Debit cards first, then credit cards
      setFilteredCards([
        ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
        ...dc,
        ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
        ...cc,
        ...(upi.length ? [{ type: "heading", label: "UPI" }] : []),
        ...upi,
        ...(nb.length ? [{ type: "heading", label: "Net Banking" }] : []),
        ...nb,
      ]);
    } else {
      // Default: Credit cards first, then debit cards
      setFilteredCards([
        ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
        ...cc,
        ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
        ...dc,
        ...(upi.length ? [{ type: "heading", label: "UPI" }] : []),
        ...upi,
        ...(nb.length ? [{ type: "heading", label: "Net Banking" }] : []),
        ...nb,
      ]);
    }
  };

  const onPick = (entry) => {
    setSelected(entry);
    setQuery(entry.display);
    setFilteredCards([]);
    setNoMatches(false);
  };

  // Chip click → set the dropdown + selected entry
  const handleChipClick = (name, type) => {
    const display = brandCanonicalize(getBase(name));
    const baseNorm = toNorm(display);
    setQuery(display);
    setSelected({ type, display, baseNorm });
    setFilteredCards([]);
    setNoMatches(false);
  };

  /** Build matches for one CSV: return wrappers {offer, site, variantText} */
  function matchesFor(offers, type, site) {
    if (!selected) return [];
    const out = [];
    for (const o of offers || []) {
      let list = [];
      if (type === "debit") {
        const dcExplicit =
          firstField(o, LIST_FIELDS.debit) ||
          firstFieldByContains(o, "eligible debit") ||
          firstFieldByContains(o, "debit card");
        const dcFromHeaders = dcExplicit ? splitList(dcExplicit) : [];
        let dc = [...dcFromHeaders];

        if (!dc.length) {
          const typeHint = getRowTypeHint(o);
          const mixed =
            firstFieldByContains(o, "eligible cards") ||
            firstFieldByContains(o, "cards");
          if (mixed && typeHint === "debit") {
            dc = splitList(mixed);
          }
        }
        if (!dc.length) {
          const tokens = Object.values(o || {})
            .filter((v) => typeof v === "string")
            .flatMap((v) => splitList(v))
            .filter((t) => /\bdebit\b/i.test(t));
          dc = tokens;
        }
        list = dc;
      } else if (type === "upi") {
        const upi =
          firstField(o, LIST_FIELDS.upi) || firstFieldByContains(o, "upi");
        list = splitList(upi);
      } else if (type === "netbanking" || type === "net banking") {
        const nb =
          firstField(o, LIST_FIELDS.netbanking) ||
          firstFieldByContains(o, "net bank") ||
          firstFieldByContains(o, "netbank");
        list = splitList(nb);
      } else {
        const cc =
          firstField(o, LIST_FIELDS.credit) ||
          firstFieldByContains(o, "eligible credit") ||
          firstFieldByContains(o, "credit card") ||
          firstFieldByContains(o, "eligible cards");
        list = splitList(cc);
      }

      let matched = false;
      let matchedVariant = "";
      for (const raw of list) {
        const base = brandCanonicalize(getBase(raw));
        if (toNorm(base) === selected.baseNorm) {
          matched = true;
          const v = getVariant(raw);
          if (v) matchedVariant = v;
          break;
        }
      }
      if (matched) {
        out.push({ offer: o, site, variantText: matchedVariant });
      }
    }
    return out;
  }

  // Collect then global-dedup
  const wSwiggy = matchesFor(swiggyOffers, selected?.type, "Swiggy");
  const wZomato = matchesFor(zomatoOffers, selected?.type, "Zomato");

  const seen = new Set();
  const dSwiggy = dedupWrappers(wSwiggy, seen);
  const dZomato = dedupWrappers(wZomato, seen);

  const hasAny = Boolean(dSwiggy.length || dZomato.length);

  /** Offer card UI (Swiggy/Zomato) with image fallback handling */
  const copyCoupon = async (code) => {
    const text = String(code || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const OfferCard = ({ wrapper }) => {
    const o = wrapper.offer;

    // fields: Offer, Description, Image(s), Link
    const title =
      o["Offer"] ||
      firstField(o, LIST_FIELDS.title) ||
      o.Website ||
      "Offer";
    const desc =
      o["Description"] ||
      firstField(o, LIST_FIELDS.desc) ||
      "";
    const coupon =
      o["Coupon Code"] ||
      o["Coupon"] ||
      o["Code"] ||
      "";
    const candidateImage =
      o["Images"] ||
      firstField(o, LIST_FIELDS.image) ||
      "";
    const link = firstField(o, LIST_FIELDS.link);

    const showVariantNote =
      VARIANT_NOTE_SITES.has(wrapper.site) &&
      wrapper.variantText &&
      wrapper.variantText.trim().length > 0;

    // Decide actual image (poster vs site-logo)
    const siteKey = String(wrapper.site || "").toLowerCase();
    const { src: imgSrc, usingFallback } = resolveImage(siteKey, candidateImage);

    return (
      <div className="offer-card">
        {imgSrc && (
          <img
            className={`offer-img ${usingFallback ? "is-fallback" : ""}`}
            src={imgSrc}
            alt={title}
            onError={(e) => handleImgError(e, siteKey)}
          />
        )}
        <div className="offer-info">
          <h3 className="offer-title">{title}</h3>
          {desc && <p className="offer-desc">{desc}</p>}

          {coupon && (
            <div className="coupon-wrap">
              <div className="coupon-title">Coupon Code</div>
              <button
                type="button"
                className="coupon-code"
                onClick={() => copyCoupon(coupon)}
                title="Click to copy coupon code"
              >
                <span className="coupon-value">{coupon}</span>
                <span className="coupon-hint">Click to copy</span>
              </button>
            </div>
          )}

          {link && (
            <button className="btn" onClick={() => window.open(link, "_blank")}>
              View Offer
            </button>
          )}

          {showVariantNote && (
            <p className="network-note">
              <strong>Note:</strong> This benefit is applicable only on{" "}
              <em>{wrapper.variantText}</em> variant
            </p>
          )}
        </div>
      </div>
    );
  };

  const chipUPIOrNB = [
    ...chipUPI.map((name) => ({ name, type: "upi" })),
    ...chipNB.map((name) => ({ name, type: "netbanking" })),
  ];

  return (
    <div className="App" style={{ fontFamily: "'Libre Baskerville', serif" }}>
      {/* Cards-with-offers strip container */}
      {(chipCC.length > 0 ||
        chipDC.length > 0 ||
        chipUPI.length > 0 ||
        chipNB.length > 0) && (
        <div
          style={{
            maxWidth: 1200,
            margin: "14px auto 0",
            padding: "14px 16px",
            background: "#F7F9FC",
            border: "1px solid #E8EDF3",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(15,23,42,.06)",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#1F2D45",
              marginBottom: 10,
              display: "flex",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span>Credit, Debit, UPI And Net Banking Which Have Offers</span>
          </div>

          {/* Credit strip */}
          {chipCC.length > 0 && (
            <marquee
              direction="left"
              scrollamount="4"
              style={{ marginBottom: 8, whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Credit Cards:
              </strong>
              {chipCC.map((name, idx) => (
                <span
                  key={`cc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "credit")}
                  onKeyDown={(e) =>
                    e.key === "Enter" ? handleChipClick(name, "credit") : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}

          {/* Debit strip */}
          {chipDC.length > 0 && (
            <marquee
              direction="left"
              scrollamount="4"
              style={{
                marginBottom: chipUPIOrNB.length > 0 ? 8 : 0,
                whiteSpace: "nowrap",
              }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Debit Cards:
              </strong>
              {chipDC.map((name, idx) => (
                <span
                  key={`dc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "debit")}
                  onKeyDown={(e) =>
                    e.key === "Enter" ? handleChipClick(name, "debit") : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}

          {/* UPI / Net Banking strip */}
          {chipUPIOrNB.length > 0 && (
            <marquee
              direction="left"
              scrollamount="4"
              style={{ whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                UPI / Net Banking:
              </strong>
              {chipUPIOrNB.map((item, idx) => (
                <span
                  key={`upi-nb-chip-${item.type}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(item.name, item.type)}
                  onKeyDown={(e) =>
                    e.key === "Enter" ? handleChipClick(item.name, item.type) : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this option"
                >
                  {item.name}
                </span>
              ))}
            </marquee>
          )}
        </div>
      )}

      {/* Search / dropdown */}
      <div
        className="dropdown"
        style={{ position: "relative", width: "600px", margin: "20px auto" }}
      >
        <input
          type="text"
          value={query}
          onChange={onChangeQuery}
          placeholder="Type a Credit or Debit Card...."
          className="dropdown-input"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            border: `1px solid ${noMatches ? "#d32f2f" : "#ccc"}`,
            borderRadius: "6px",
          }}
        />
        {query.trim() && !!filteredCards.length && (
          <ul
            className="dropdown-list"
            style={{
              listStyle: "none",
              padding: "10px",
              margin: 0,
              width: "100%",
              maxHeight: "260px",
              overflowY: "auto",
              border: "1px solid #ccc",
              borderRadius: "6px",
              backgroundColor: "#fff",
              position: "absolute",
              zIndex: 1000,
            }}
          >
            {filteredCards.map((item, idx) =>
              item.type === "heading" ? (
                <li
                  key={`h-${idx}`}
                  style={{
                    padding: "8px 10px",
                    fontWeight: 700,
                    background: "#fafafa",
                  }}
                >
                  {item.label}
                </li>
              ) : (
                <li
                  key={`i-${idx}-${item.display}`}
                  onClick={() => onPick(item)}
                  style={{
                    padding: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f2f2f2",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#f7f9ff")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {item.display}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {noMatches && query.trim() && (
        <p style={{ color: "#d32f2f", textAlign: "center", marginTop: 8 }}>
          No matching cards found. Please try a different name.
        </p>
      )}

      {/* Offers by section */}
      {selected && hasAny && !noMatches && (
        <div
          className="offers-section"
          style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}
        >
          {!!dSwiggy.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers On Swiggy</h2>
              <div className="offer-grid">
                {dSwiggy.map((w, i) => (
                  <OfferCard key={`sw-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}

          {!!dZomato.length && (
            <div className="offer-group">
              <h2 style={{ textAlign: "center" }}>Offers On Zomato</h2>
              <div className="offer-grid">
                {dZomato.map((w, i) => (
                  <OfferCard key={`zo-${i}`} wrapper={w} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selected && !hasAny && !noMatches && (
        <p style={{ color: "#d32f2f", textAlign: "center", marginTop: 10 }}>
          No offer available for this card
        </p>
      )}

      {selected && hasAny && !noMatches && (
        <button
          onClick={() =>
            window.scrollBy({ top: window.innerHeight, behavior: "smooth" })
          }
          style={{
            position: "fixed",
            right: 20,
            bottom: isMobile ? 220 : 250,
            padding: isMobile ? "12px 15px" : "10px 20px",
            backgroundColor: "#1e7145",
            color: "white",
            border: "none",
            borderRadius: isMobile ? "50%" : 8,
            cursor: "pointer",
            fontSize: 18,
            zIndex: 1000,
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            width: isMobile ? 50 : 140,
            height: isMobile ? 50 : 50,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isMobile ? "↓" : "Scroll Down"}
        </button>
      )}

      <Disclaimer />
    </div>
  );
};

export default AirlineOffers;
