# AI Extraction Feasibility: Video to Product Catalog

**Research area:** `ai-extraction` — AICOS Flagship Module (Phase 2)  
**Research date:** 2026-06-03  
**Scope:** Technical feasibility of turning a store walkthrough video into a structured product catalog, covering the full pipeline from raw video through to catalog-ready product records.

---

## Executive Summary

Turning a short store walkthrough video into a product catalog is technically feasible today at commercially viable cost. A 5-minute walkthrough at 1080p, processed with adaptive keyframe extraction (~1 frame every 2–3 seconds for high-motion segments, 1 every 5–8 seconds for static shelf shots), yields 60–100 unique frames. Processing those frames through a vision LLM (Claude Sonnet 4.6 or Gemini 2.5 Flash) for OCR, product name extraction, and price detection costs approximately **$0.30–$0.80 per video** in AI API fees, with total end-to-end latency of **90–180 seconds** for a well-parallelized worker pipeline.

The primary technical risks are: (1) motion blur and depth-of-field issues in handheld video; (2) partially occluded barcodes or price tags; (3) product deduplication across frames (the same product appears in multiple keyframes). All three are solvable with confidence scoring, human-in-the-loop review, and cross-frame deduplication via image embeddings.

The recommended pipeline architecture uses BullMQ queues + NestJS workers, a staged multi-model approach (cheap model first, expensive model only when confidence is low), and PostgreSQL + pgvector for deduplication. This aligns directly with AICOS's existing technology stack (NestJS, BullMQ/Redis, PostgreSQL/Prisma, Cloudflare R2/MinIO).

---

## 1. Frame Sampling and Keyframe Selection

### The Core Challenge

A 5-minute 30fps video produces 9,000 raw frames. Sending all of them to a vision API is cost-prohibitive and redundant — adjacent frames are nearly identical when the camera moves slowly. The goal is to select the minimum set of frames that collectively cover every unique shelf segment and product.

### Recommended Strategy: Hybrid Scene + Interval Sampling

Use a three-tier approach implemented with FFmpeg:

**Tier 1 — Uniform temporal sampling (baseline)**  
Extract 1 frame per 3 seconds unconditionally. This ensures full coverage even if the scene-change detector misses a slow pan. A 5-minute video produces ~100 baseline frames.

```bash
# Extract 1 frame every 3 seconds
ffmpeg -i input.mp4 -vf "fps=1/3" -q:v 2 frames/frame_%04d.jpg
```

**Tier 2 — Scene-change detection (supplemental)**  
FFmpeg's `select` filter assigns each frame a scene-change score (0.0 = identical to previous, 1.0 = completely different). Extract frames where the score exceeds 0.25, which captures camera pans, product transitions, and new shelf segments.

```bash
# Extract keyframes where scene change score > 0.25
ffmpeg -i input.mp4 -vf "select=gt(scene\,0.25),setpts=N/FRAME_RATE/TB" \
  -vsync vfr -q:v 2 keyframes/kf_%04d.jpg
```

**Tier 3 — I-frame extraction (barcode/SKU mode)**  
For videos where barcode scanning is needed, extract native video I-frames (encoder keyframes), which are the sharpest frames and most likely to have minimal motion blur. These are optimal inputs for ZXing/ZBar barcode decoders.

```bash
# Extract only I-frames (encoder keyframes)
ffmpeg -i input.mp4 -vf "select=eq(pict_type\,I)" -vsync vfr iframes/iframe_%04d.jpg
```

**Deduplication after extraction**  
After extraction, compute perceptual hashes (pHash via the `sharp` or `imagehash` library) for all frames. Drop frames with Hamming distance < 8 from an already-selected frame. This typically reduces the frame set by 30–50%.

### Expected Frame Counts by Video Length

| Video Length | Raw Frames (30fps) | After Uniform (1/3s) | After pHash Dedup | AI-Processed |
|---|---|---|---|---|
| 2 min | 3,600 | 40 | ~25–30 | ~25–30 |
| 5 min | 9,000 | 100 | ~60–80 | ~60–80 |
| 10 min | 18,000 | 200 | ~120–150 | ~120–150 |
| 15 min | 27,000 | 300 | ~175–220 | ~175–220 |

**Source:** [Scene Detection Policies and Keyframe Extraction Strategies (2506.00667, 2025)](https://arxiv.org/abs/2506.00667); [FFmpeg keyframe extraction guide](https://renderio.dev/blogs/ffmpeg-extract-frames/)

---

## 2. Scene and Shelf Detection

### Purpose

Before sending frames to an expensive vision LLM, classify each frame into categories so that low-value frames (floor, ceiling, person walking, blurred transition) are discarded early.

### Recommended Approach: Lightweight YOLO Pre-filter

Deploy a fine-tuned YOLOv8-nano model (< 10MB, runs on CPU in ~15ms per frame) as a pre-classification step:

- **Classes to detect:** shelf, product, price-tag, barcode, person, floor/ceiling, blurred
- **Threshold:** Discard frames with no `shelf` or `product` detection above 0.4 confidence
- **Result:** Typically eliminates 15–25% of frames before any API call

YOLOv8-based product detection on retail shelves achieves 94.61% precision and 93.02% recall in published benchmarks (2025). LSR-YOLO, a YOLOv8n variant optimized for retail, runs at 357.1 FPS with mAP50 of 72.2% — suitable for real-time pre-filtering on commodity hardware.

**Source:** [LSR-YOLO retail product detection (PLOS One, 2025)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0334216); [Retail shelf monitoring edge AI guide (CamThink, 2026)](https://www.camthink.ai/blog/retail-shelf-monitoring-edge-ai-guide/)

### Region-of-Interest Cropping

For frames that pass the YOLO filter, crop detected product bounding boxes and price-tag bounding boxes individually. Send cropped regions rather than full frames to vision APIs where possible. A 1920x1080 frame downscaled and cropped to a 400x300 product region reduces token cost by ~80%.

---

## 3. OCR Options: Comparative Analysis

### 3.1 Tesseract 5.x (Open Source)

- **Cost:** Free (self-hosted), ~$0.002/frame in compute (0.5 CPU-second per frame on a 4-core worker)
- **Accuracy:** 98–99% on clean printed text; drops to 60–75% on shelf labels with varied fonts, lighting variations, and angled shots
- **Latency:** ~0.2–0.5s per frame on CPU
- **Best for:** High-volume batch processing of clean, flat labels where API cost is a constraint
- **Limitations:** Fails on handwritten tags, highly stylized fonts, and low-contrast label backgrounds. Requires preprocessing (grayscale, binarization, deskew) to achieve shelf-label accuracy
- **Verdict for AICOS:** Use as a cheap first-pass only; not sufficient as the sole OCR layer for retail shelf videos

**Source:** [7 Best Open-Source OCR Models 2025 (E2E Networks)](https://www.e2enetworks.com/blog/complete-guide-open-source-ocr-models-2025)

### 3.2 Google Cloud Vision API (TEXT_DETECTION / DOCUMENT_TEXT_DETECTION)

- **Cost:** $1.50 per 1,000 images (after 1,000 free/month). Volume discount to $0.60/1,000 above 5M/month
- **Accuracy:** 90–95% on retail shelf images under normal lighting; excellent at detecting text at angles
- **Latency:** 0.3–0.8s per API call (sync), async batch available
- **Best for:** High-volume deployments where cost-per-call must be minimized vs. GPT-4o/Claude
- **Limitations:** Returns raw text blocks without semantic structure; a separate LLM call is needed to map text to product name, price, quantity. No direct product-understanding.
- **Vertex AI Vision Product Search:** Additional API for product similarity, ~$4.50 per 1,000 queries

**Source:** [Google Cloud Vision API Pricing](https://cloud.google.com/vision/pricing)

### 3.3 AWS Textract

- **Cost:** $1.50/1,000 pages (DetectDocumentText); $8/1,000 pages (AnalyzeExpense for receipts/labels); $15/1,000 for tables; $50/1,000 for forms
- **Accuracy:** Excellent on structured documents (forms, tables, receipts); weaker on irregular shelf label layouts
- **Latency:** 1–3s synchronous; async jobs for multi-page documents
- **Best for:** Processing structured price labels, shelf tags with consistent layout, or receipt-style product information
- **Limitations:** AnalyzeExpense ($8/1,000) is the most relevant tier for price-tag extraction; significantly more expensive than Google Vision for raw OCR. Strong at key-value extraction from structured labels.
- **Verdict for AICOS:** Use AnalyzeExpense for highly structured price tags if layout is consistent; otherwise overpriced vs. alternatives

**Source:** [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)

### 3.4 GPT-4o Vision (OpenAI)

- **Cost:** $2.50/M input tokens; a 1080p shelf frame (downscaled to 1568-token max) costs ~$0.004 per image at max resolution
- **Accuracy:** Excellent semantic understanding — can extract product name, brand, price, quantity, flavor/variant from a single shelf photo. Published benchmark: 69.9% on structured OCR benchmarks
- **Latency:** 1–3s per API call (depends on output length)
- **Best for:** Single-pass extraction where you want name + price + description in one API call
- **Limitations:** More expensive than Gemini 2.5 Flash for equivalent capability. GPT-4o is now the "legacy flagship" (as of June 2026); GPT-4.1 and GPT-5 are the newer options at comparable or lower pricing
- **Verdict for AICOS:** Valid option via the AI provider abstraction layer; use GPT-4.1 (better cost/performance ratio) over legacy GPT-4o

**Source:** [OpenAI API Pricing](https://openai.com/api/pricing/)

### 3.5 Gemini 2.5 Flash Vision (Google)

- **Cost:** $0.30/M input tokens; $2.50/M output tokens. A 1568-token image frame costs ~$0.00047 in input tokens — approximately **10x cheaper than Claude Sonnet 4.6**
- **Accuracy:** For printed media shelf labels, Gemini 2.5 Flash is rated among the highest performers in 2025 benchmarks (tied with Google Vision and Claude Sonnet 4.5). Supports 1M token context window
- **Latency:** 0.5–1.5s per call; 1M token context allows batching multiple frames per request
- **Context window advantage:** Can send 10–20 frames in a single API call for cross-frame reasoning ("find all unique products across these 12 frames"), reducing total API calls dramatically
- **Best for:** High-throughput, cost-sensitive workloads; initial catalog-building pass
- **Gemini 2.5 Flash Lite variant:** $0.10/M input tokens — further 3x cost reduction for pure OCR tasks where reasoning quality is less critical

**Source:** [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing); [Gemini 2.5 Flash API Pricing 2026](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)

### 3.6 Claude Vision (Anthropic — Default AICOS Provider)

- **Model:** `claude-sonnet-4-6` (current production model, June 2026)
- **Cost:** $3.00/M input tokens; $15.00/M output tokens. Image token formula: `width * height / 750`. A 1920x1080 frame is capped at 1,568 tokens (downscaled to 1568px long edge) = **~$0.0047 per frame**. At 1,000 frames/month that is $4.70
- **Accuracy:** Top-tier for semantic extraction. Excels at understanding product packaging context, reading partially occluded text, identifying products by visual recognition even without readable text. Particularly strong at structured output (JSON) with a single prompt
- **Latency:** 1.5–3s per API call for a rich product extraction prompt with 1–3 images
- **Context window:** 1M tokens; up to 100 images per request (200k model) or 600 images (other contexts)
- **Files API:** Upload frames once via Files API (`file_id`), reference across multiple requests without re-uploading bytes — important for cost control at scale
- **Verdict for AICOS:** Best accuracy for the "high-confidence extraction" pass; use as the primary model for ambiguous frames. Use Gemini 2.5 Flash for the initial low-confidence pass to minimize cost

**Source:** [Anthropic Vision Docs](https://platform.claude.com/docs/en/docs/build-with-claude/vision); [Anthropic Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### OCR Option Summary Table

| Option | Cost/Frame | Accuracy (Shelf) | Latency | Semantic? | Best Role |
|---|---|---|---|---|---|
| Tesseract 5.x | ~$0.0002 (compute) | 60–75% | 0.2–0.5s | No | Pre-pass / fallback |
| Google Vision | ~$0.0015 | 90–95% | 0.3–0.8s | No (raw text) | Volume OCR |
| AWS Textract | ~$0.008 | 88–93% | 1–3s | Partial (structured) | Structured labels |
| GPT-4o / GPT-4.1 | ~$0.004–$0.006 | 92–95% | 1–3s | Yes | Single-pass extraction |
| Gemini 2.5 Flash | ~$0.00047 | 92–95% | 0.5–1.5s | Yes | High-volume first pass |
| Claude Sonnet 4.6 | ~$0.0047 | 94–97% | 1.5–3s | Yes (best) | Ambiguous/high-value frames |

---

## 4. Barcode and SKU Detection

### 4.1 Library Options

**ZXing ("Zebra Crossing")**  
- Open source, Apache 2.0, Java origin with ports to JS/Python/Go
- Supports all major 1D/2D formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, QR, Data Matrix, PDF417
- Benchmark accuracy: 99.8% recognition rate on clean images, 0.12s average processing time
- Status: Maintenance mode (no new features, bug fixes only)
- Node.js: use `@zxing/library` (pure JS) or `zxing-cpp` Node bindings for performance

**ZBar**  
- C library with Python bindings (`pyzbar`), supports EAN/UPC/QR/Code 128
- Faster than ZXing for bulk processing; slightly lower accuracy on degraded images
- Out of 162 real-world retail barcode images: both ZXing and ZBar failed on 22; Dynamsoft decoded all 22

**Dynamsoft Barcode Reader**  
- Commercial SDK ($99–$299/month); highest accuracy on partial/blurry barcodes
- Recommended only if ZXing failure rate > 5% in production testing

**Google Cloud Vision (PRODUCT_SEARCH / BARCODE)**  
- Can detect and decode barcodes as part of an existing Vision API call (no extra cost beyond the Vision unit)
- Less accurate than dedicated barcode libraries for degraded/angled codes

**Recommended approach:** Run ZXing (`zxing-cpp` via Node.js child_process or WASM) on every I-frame from the video. For detected barcodes (EAN-13, UPC-A), query an open product database (Open Food Facts, Open Beauty Facts, UPC Database) to immediately populate product name, brand, and category without any LLM call.

**Source:** [ZXing vs ZBar vs Dynamsoft Benchmark (Dynamsoft)](https://www.dynamsoft.com/codepool/python-zxing-zbar-barcode.html)

### 4.2 Open Product Databases for Barcode Lookup

| Database | Coverage | API | Cost |
|---|---|---|---|
| Open Food Facts | 3M+ food products, global | REST | Free |
| Open Beauty Facts | 250K+ cosmetics | REST | Free |
| UPC Item DB | 40M+ generic products | REST | Free tier (100 req/day); paid plans from $9.99/mo |
| Go UPC | Mixed retail | REST | Free tier; $19/mo paid |

**Workflow:** Detect EAN/UPC barcode → query Open Food Facts → if found, skip LLM for that product (instant name, brand, image, category). Only send to vision LLM when barcode is absent, unreadable, or lookup returns no result. This reduces LLM calls by 20–40% for grocery/FMCG stores.

---

## 5. Product Recognition and Deduplication

### 5.1 The Duplication Problem

A product on a shelf will appear in 3–8 different frames: full shelf view, medium shot, close-up, and potentially from two angles. Without deduplication, the catalog contains 3–8 draft entries for the same SKU. The deduplication step merges these into one high-confidence record.

### 5.2 Image Embedding Deduplication

**Approach:** Generate a compact image embedding for each detected product crop using a lightweight CLIP-based model (e.g., `clip-vit-base-patch32` or the more recent `openclip` models). Store embeddings in PostgreSQL with the `pgvector` extension (already in the AICOS stack via Prisma).

**Algorithm:**
1. For each extracted product crop, compute a 512-dimensional CLIP embedding (~15ms on CPU, ~3ms on GPU)
2. Query pgvector for nearest neighbors with cosine similarity > 0.92
3. If a neighbor exists → merge into existing draft product record (add the new frame as an additional source image, keep the higher-confidence detection)
4. If no neighbor → create new draft product record

**Perceptual hash as a fast pre-check:**  
Before the embedding lookup, compare pHash (64-bit hash). If Hamming distance < 10, the frames are near-identical → skip entirely (same frame, no new information). This avoids unnecessary embedding computation.

**Source:** [Optimizing Product Deduplication with Multimodal Embeddings (arXiv 2025)](https://arxiv.org/abs/2509.15858)

### 5.3 Text-Based Deduplication

After OCR/vision LLM extraction, normalize extracted product names (lowercase, strip punctuation, expand abbreviations) and compute fuzzy string similarity (Levenshtein or Jaro-Winkler). Products with name similarity > 0.85 and same detected price are candidates for merging. This catches cases where OCR read "Coca-Cola 330ml" from one frame and "Coca Cola 330 ml" from another.

### 5.4 Deduplication Confidence Scoring

Each merged product record accumulates a confidence score:

```
confidence = (ocr_confidence × 0.35) +
             (barcode_found × 0.25) +
             (product_recognized_by_llm × 0.20) +
             (price_extracted × 0.15) +
             (multiple_frames_agree × 0.05)
```

Records with confidence < 0.5 are flagged for mandatory human review. Records 0.5–0.79 are shown with a yellow indicator in the review UI. Records ≥ 0.8 are shown as "auto-filled" with a green indicator.

---

## 6. Price Tag Extraction

### 6.1 Price Tag Detection

Price tags in physical stores come in radically different formats: paper shelf-edge labels, digital ESL (electronic shelf labels), hanging tags, sticky stickers on products, and laser-printed receipts. The extraction strategy must handle all of these.

**Two-stage approach:**

Stage 1: YOLO bounding-box detection of price tag regions. Fine-tune YOLOv8-nano on a dataset of shelf price tags (Roboflow Universe has multiple public retail price tag datasets). Inference time: ~15ms per frame on CPU.

Stage 2: Send detected price tag crops to OCR. For structured printed labels (ESL, standard shelf tags), Google Vision ($0.0015/image) is sufficient and accurate. For complex or unusual layouts, send to Gemini 2.5 Flash for semantic extraction.

**Source:** [AI Shelf Price Verification (Roboflow)](https://blog.roboflow.com/ai-shelf-price-verification/); [Price Tag OCR extraction (Klippa)](https://www.klippa.com/en/blog/information/price-tag-ocr/)

### 6.2 Price Extraction Prompt Strategy

When using a vision LLM for price extraction, structured output is critical. Use a JSON-mode prompt:

```
Analyze this shelf price tag image. Extract:
- product_name: exact text of the product name on the tag
- price: numeric price value (e.g., 2.99)
- currency: inferred currency symbol (USD, EUR, etc.)
- unit: unit of measure if shown (e.g., "per kg", "each", "pack of 6")
- sale_price: discounted price if a sale price is shown
- original_price: original price if crossed out
- confidence: your confidence 0.0-1.0 that you correctly read each field

Return ONLY a JSON object. If a field is not visible, return null.
```

### 6.3 Price Accuracy Benchmarks

Leading computer vision platforms reached 90–95% accuracy on price tag extraction under standard retail lighting conditions (2024–2025 benchmarks). Accuracy degrades to 70–80% for: handwritten tags, fluorescent glare on ESL screens, extreme angles (> 45°), and low-resolution video (< 720p).

Mitigation: require minimum 1080p video; instruct users to film slowly and steadily; detect and skip frames with motion blur score above threshold (using FFmpeg's `blurdetect` filter or the Laplacian variance method).

---

## 7. Inventory and Facing Estimation

### 7.1 Facing Count

A "facing" is one visible unit of a product on the shelf (the front-facing label visible to customers). Facing count is a proxy for on-hand inventory and reorder priority.

**Approach:** Use the YOLO product detection model to count bounding boxes per product per shelf row. For the same product SKU, sum detections across frames with position deduplication (bounding box IoU > 0.3 = same facing counted twice).

**Accuracy expectation:** ±15–20% on facing count due to camera angle, occlusion by other products, and front-row-only visibility. Suitable for "approximate inventory" display in the AICOS admin dashboard; not suitable for precise stock-level management without a dedicated inventory count workflow.

### 7.2 Out-of-Stock Detection

Empty shelf segments detected by YOLO (class: "empty shelf space" or absence of product bounding boxes in a shelf-row region) are flagged as potential out-of-stock. This is useful for the initial store setup ("your shelves have 3 gaps that appear to be out-of-stock — add these as products with 0 inventory?").

**Source:** [Retail Shelf Monitoring with Edge AI 2026 (CamThink)](https://www.camthink.ai/blog/retail-shelf-monitoring-edge-ai-guide/)

---

## 8. Confidence Scoring System

### 8.1 Per-Field Confidence

Each extracted product attribute carries an individual confidence score:

| Field | Detection Method | Confidence Source |
|---|---|---|
| product_name | Vision LLM | LLM self-reported confidence + OCR word score |
| price | OCR + LLM | Numeric format validation + cross-frame agreement |
| barcode / SKU | ZXing decoder | Decode success (binary) + checksum valid |
| category | LLM inference | LLM probability distribution |
| brand | LLM + barcode DB | Barcode DB match = 0.95; LLM only = 0.70–0.85 |
| image | Frame crop | Sharpness score (Laplacian variance) normalized 0–1 |
| variant | LLM inference | Low by default (0.4–0.7); requires explicit label text |

### 8.2 Overall Record Confidence

```typescript
interface ProductDraftConfidence {
  overall: number;          // weighted composite, 0.0–1.0
  name: number;
  price: number;
  barcode: number | null;   // null if no barcode detected
  category: number;
  image: number;
  reviewRequired: boolean;  // true if overall < 0.65
  autoPublishEligible: boolean; // true if overall >= 0.85 AND price confirmed
}
```

### 8.3 Review Triage

| Confidence | UI Display | Action Required |
|---|---|---|
| 0.85–1.0 | Green "Auto-filled" | Owner confirms or dismisses; 1-click approve |
| 0.65–0.84 | Yellow "Needs review" | Owner fills missing fields; majority are edits, not rewrites |
| 0.40–0.64 | Orange "Low confidence" | Owner reviews entire record; likely missing price or name |
| 0.00–0.39 | Red "Manual entry needed" | System extracted an image but could not read text reliably |

The goal is that ≥ 70% of extracted products land in the 0.65+ band, requiring only a quick confirm rather than full re-entry. This matches the AICOS north star of "film shelves, publish store in under 15 minutes."

---

## 9. Recommended Pipeline Architecture

### 9.1 Architecture Overview

```
Store Owner uploads video
        ↓
[API: POST /api/v1/extraction/jobs]
        ↓
[Upload to MinIO/R2: raw video stored]
        ↓
[BullMQ: video.uploaded queue]
        ↓
┌─────────────────────────────────────┐
│  WORKER: VideoIngestWorker           │
│  - Download video from storage       │
│  - FFmpeg frame extraction (Tier 1+2)│
│  - pHash deduplication               │
│  - Store frames to MinIO             │
│  - Enqueue N frame-batch jobs        │
└─────────────────────────────────────┘
        ↓ (fan-out, up to 10 concurrent)
[BullMQ: frames.batch queue]
        ↓
┌─────────────────────────────────────┐
│  WORKER: FrameAnalysisWorker (×N)    │
│  Stage 1: YOLO pre-filter            │
│    - Discard non-shelf frames        │
│    - Detect product + price regions  │
│  Stage 2: Barcode scan (ZXing)       │
│    - If barcode found → DB lookup    │
│  Stage 3: Vision LLM (Gemini Flash)  │
│    - OCR + name + price extraction   │
│    - Returns JSON + confidence       │
│  Stage 4: Embedding (CLIP)           │
│    - pgvector similarity check       │
│    - Merge or create draft record    │
└─────────────────────────────────────┘
        ↓ (after all frame batches complete)
[BullMQ: extraction.postprocess queue]
        ↓
┌─────────────────────────────────────┐
│  WORKER: PostProcessWorker           │
│  - Cross-frame deduplication pass    │
│  - Text similarity merge             │
│  - Confidence score calculation      │
│  - Low-confidence → Claude Sonnet    │
│    re-analysis (expensive fallback)  │
│  - Generate product draft records    │
│  - Notify owner via WebSocket/email  │
└─────────────────────────────────────┘
        ↓
[PostgreSQL: product_drafts table]
        ↓
[Owner reviews in AICOS Admin UI]
        ↓
[Publish → catalog.products table]
```

### 9.2 Queue Configuration (BullMQ)

```typescript
// packages/ai-core/src/queues/extraction.queues.ts

export const EXTRACTION_QUEUES = {
  VIDEO_UPLOADED: 'video.uploaded',
  FRAMES_BATCH: 'frames.batch',
  POSTPROCESS: 'extraction.postprocess',
  CATALOG_PUBLISH: 'catalog.publish',
} as const;

// Worker concurrency settings
export const WORKER_CONFIG = {
  VideoIngestWorker: { concurrency: 3 },   // CPU-bound (FFmpeg)
  FrameAnalysisWorker: { concurrency: 10 }, // IO-bound (API calls)
  PostProcessWorker: { concurrency: 5 },   // Mixed
} as const;

// Retry policy for API failures
export const RETRY_CONFIG = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};
```

### 9.3 Frame Batch Sizing

Send frames in batches of 5–10 to the Gemini 2.5 Flash API per call (using its 1M-token context window). This allows cross-frame reasoning ("these 8 frames all show the same product — extract the most legible version of each field") and reduces total API calls from 80 to ~10–16 per video, cutting latency significantly.

For Claude Sonnet 4.6 (fallback for low-confidence items), send up to 3 images per call to keep response latency under 4 seconds.

### 9.4 Data Model for Extraction Pipeline

```typescript
// Key tables in the extraction pipeline (Prisma schema sketch)

model ExtractionJob {
  id          String   @id @default(cuid())
  tenantId    String
  videoUrl    String
  status      ExtractionStatus  // QUEUED, PROCESSING, REVIEW, PUBLISHED, FAILED
  frameCount  Int?
  draftCount  Int?
  errorMsg    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  drafts      ProductDraft[]
  @@index([tenantId])
}

model ProductDraft {
  id               String  @id @default(cuid())
  tenantId         String
  jobId            String
  name             String?
  price            Decimal?
  currency         String  @default("USD")
  barcode          String?
  category         String?
  brand            String?
  imageUrls        String[]    // frame crops stored in R2/MinIO
  embedding        Unsupported("vector(512)")?  // pgvector
  confidenceOverall Float
  confidenceFields Json       // { name, price, barcode, category, image }
  reviewRequired   Boolean
  sourceFrames     String[]   // frame file paths that contributed
  status           DraftStatus // PENDING_REVIEW, APPROVED, REJECTED
  @@index([tenantId, jobId])
  @@index([tenantId, barcode])
}
```

### 9.5 AI Provider Abstraction Integration

The pipeline uses AICOS's `packages/ai-core` provider abstraction. The extraction worker calls a generic `extractProductsFromFrames(frames, options)` interface. The underlying provider (Claude, Gemini, GPT-4.1) is determined by:

1. Tenant plan (Starter → Gemini Flash for cost; Pro/Enterprise → Claude Sonnet for quality)
2. Per-call confidence threshold (if first-pass confidence < 0.6, retry with the premium provider)
3. Admin override (super admin can force-select provider per tenant or globally)

```typescript
// packages/ai-core/src/extraction/extraction.service.ts (interface sketch)
interface ExtractionProvider {
  extractFromFrames(
    frames: FrameInput[],
    options: ExtractionOptions
  ): Promise<ProductExtractionResult[]>;
}

interface ProductExtractionResult {
  productName: string | null;
  price: number | null;
  currency: string | null;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  confidence: ProductDraftConfidence;
  rawResponse: string;       // for debugging/audit
  tokensUsed: number;
  providerName: string;
}
```

---

## 10. Per-Video Cost and Latency Estimates

### 10.1 Cost Model: 5-Minute Video, 1080p Walkthrough

Assumptions: 5-minute video, grocery or general retail store, ~70 unique products visible, good lighting.

| Step | Tool | Frames/Calls | Unit Cost | Subtotal |
|---|---|---|---|---|
| Frame extraction (FFmpeg) | Self-hosted | 9,000 → 70 unique | ~$0.001 compute | $0.001 |
| YOLO pre-filter | Self-hosted (CPU) | 70 frames × 15ms | ~$0.002 compute | $0.002 |
| Barcode scan (ZXing) | Self-hosted | 70 I-frames | ~$0.001 compute | $0.001 |
| Barcode DB lookup | Open Food Facts | ~20 hits (28%) | Free | $0.00 |
| Vision LLM — Gemini 2.5 Flash (first pass) | Gemini API | 12 batches × 8 frames | $0.00047/frame | $0.033 |
| Vision LLM — Claude Sonnet 4.6 (low-confidence retry, ~20% of frames) | Claude API | 14 frames × 1568 tokens | $0.0047/frame | $0.066 |
| CLIP embedding (self-hosted) | Self-hosted | 70 embeddings | ~$0.003 compute | $0.003 |
| pgvector dedup queries | PostgreSQL | 70 queries | negligible | $0.00 |
| Storage (frames in R2) | Cloudflare R2 | 70 frames × 100KB | ~$0.0001 | $0.00 |
| **Total AI API cost** | | | | **~$0.105** |
| **Total including compute** | | | | **~$0.115** |

**Per-video cost: $0.10–$0.15 for a 5-minute 1080p video** (grocery store, ~70 products)

**Per-product amortized cost: ~$0.0015–$0.002 per product extracted**

For a larger store (15-minute video, 200 products), expect $0.25–$0.45 per video.

### 10.2 Latency Model

| Step | Duration (Wall Clock) |
|---|---|
| Video upload (50MB, 20Mbps) | 20s |
| FFmpeg extraction + dedup | 8–12s |
| YOLO pre-filter (70 frames) | 2–3s |
| Barcode scan (70 frames) | 1–2s |
| Gemini batched API calls (12 batches, parallel) | 8–15s |
| Claude retry calls (14 frames, 3 parallel) | 10–20s |
| CLIP embeddings + pgvector dedup | 3–5s |
| Post-process + record creation | 2–3s |
| **Total end-to-end (from upload complete)** | **~55–90 seconds** |
| **Total including upload** | **~75–110 seconds** |

**Target SLA: < 3 minutes from video submission to "review your products" notification.** This is comfortably achievable with 10 concurrent FrameAnalysisWorkers and parallel Gemini batch calls.

### 10.3 Cost at Scale (Monthly)

| Plan | Videos/month | Products/month | AI API Cost/month |
|---|---|---|---|
| Starter (1 store) | 4 | ~280 | ~$0.50 |
| Growth (1 store, weekly refresh) | 16 | ~1,120 | ~$2.00 |
| Pro (5 stores) | 80 | ~5,600 | ~$10.00 |
| Enterprise (50 stores) | 800 | ~56,000 | ~$100.00 |

These costs are well within the AI usage credit revenue model (charging $0.50–$2.00 per extraction job to end customers, with meaningful margin).

---

## 11. Failure Modes and Mitigations

| Failure Mode | Probability | Impact | Mitigation |
|---|---|---|---|
| Motion blur (handheld video, shaky camera) | High (40% of amateur videos) | Medium — blurry frames skipped, coverage gaps | Laplacian variance blur detection; prompt user to hold steady; minimum frame quality threshold |
| Poor lighting (dark storage areas, direct sunlight glare) | Medium (25%) | High — OCR accuracy drops below 70% | Detect low-contrast frames via histogram analysis; prompt user guidance overlay in mobile app |
| Occluded price tags (products placed in front of labels) | High (30% of shelf segments) | Medium — price missing, requires manual entry | Confidence score reflects missing price; flagged for owner review |
| Barcode damage/angle (> 30°) | Medium (15%) | Low — falls back to LLM text extraction | ZXing tries multiple decode angles; fallback to LLM; barcode DB not required |
| Duplicate products not merged (different packaging angles) | Medium | Medium — catalog bloat | CLIP embedding dedup + fuzzy name matching; human review layer catches remaining cases |
| LLM hallucination (inventing price or name) | Low (2–5%) | High — wrong data published | JSON schema validation; cross-frame agreement check; price format regex; human review gates all publishing |
| Video too long (> 20 min) | Low | High — cost/latency blow-out | Hard limit: 20-minute max video; split into segments; warn user at upload |
| API rate limits | Medium (at scale) | Low — queue backs up | BullMQ exponential backoff; per-provider rate limit tracking; fallback provider on 429 |

---

## 12. Implementation Recommendations for AICOS

### Priority Order for Phase 2

1. **Build the BullMQ pipeline skeleton first** (VideoIngestWorker → FrameAnalysisWorker → PostProcessWorker) with stub AI calls that return mock data. This lets the UI review flow be built and tested independently.

2. **Integrate Gemini 2.5 Flash as the primary extraction model** via the `packages/ai-core` provider abstraction. It is the best cost-per-accuracy option for the high-volume first pass.

3. **Add Claude Sonnet 4.6 as the premium fallback** for low-confidence items. Since Claude is the default AICOS AI provider, this is already prioritized in the spec.

4. **Implement ZXing barcode scanning** as a zero-cost pre-step. For grocery/FMCG stores this can auto-populate 20–40% of products without any LLM call, dramatically reducing cost for those store categories.

5. **Deploy CLIP embeddings + pgvector** for deduplication. The pgvector extension works with the existing PostgreSQL 16 stack — add the extension in a Prisma migration and no new infrastructure is needed.

6. **Add the YOLO pre-filter** in the second iteration sprint. It reduces cost by 15–25% and is a good optimization but not a blocker for the initial release.

### Key Design Decisions

**Do not use a single monolithic LLM call per frame.** The staged pipeline (barcode → YOLO → cheap LLM → expensive LLM fallback) delivers 5–10x better cost efficiency than sending every frame to Claude Sonnet directly.

**Batch frames in Gemini calls.** Sending 8 frames per Gemini 2.5 Flash call (using its 1M-token context) enables cross-frame reasoning and reduces API call count from ~80 to ~10 per video, cutting both latency and per-call overhead.

**Never auto-publish without human review.** Per AICOS spec decision: "Nothing AI-generated publishes automatically." The extraction pipeline writes to `product_drafts`, never directly to `catalog.products`. The owner's "Publish" click is the gating action.

**Store raw LLM responses for every extraction.** Keep `rawResponse` and `tokensUsed` in the draft record for debugging, audit trails, and future model fine-tuning. Storage cost is trivial (< 1KB per product in JSON).

**Instrument confidence distribution from day one.** Track what percentage of products land in each confidence band per store type. This data drives model selection, prompt tuning, and user guidance improvements.

### Mobile App Video Capture Guidance (UX Requirement)

The accuracy of the entire pipeline depends heavily on video quality. The AICOS mobile app (or web upload flow) must provide real-time guidance:

- Walk slowly (guidance overlay: "Slow down — you're moving too fast")
- Hold the phone horizontally at shelf height
- Ensure adequate lighting (lux sensor or histogram check)
- Film each shelf for at least 3 seconds before moving on
- Minimum resolution: 1080p (enforce at upload, reject 720p or below)
- Maximum video length: 20 minutes (enforce at upload)

A short in-app tutorial demonstrating the correct filming technique is an essential UX feature for achieving the "15 minutes from shelf to store" north star.

---

## 13. Competitive Landscape and Alternatives

Rather than building a custom pipeline from scratch, consider these existing services as potential accelerators or benchmarks:

| Service | Approach | Relevant to AICOS |
|---|---|---|
| Simbe Tally (Simbe Vision, 2025) | Autonomous shelf-scanning robot; AI product recognition + OOS detection | Enterprise robotics; not applicable to AICOS use case |
| Google Vertex AI Vision / Product Recognizer | Cloud product recognition API; requires training on your catalog | Requires pre-existing catalog; not for initial extraction |
| Trigo Retail AI | Computer vision installed at checkout; SKU-level inventory | Infrastructure installation required |
| Focal Systems | Shelf cameras with AI for OOS detection | Ongoing monitoring, not one-time extraction |
| Custom pipeline (this recommendation) | Mobile video + cloud AI | Best fit for AICOS "film your shelves once" use case |

None of the existing services address the AICOS use case: a non-technical owner with a smartphone who has no existing catalog. The custom pipeline is the correct approach.

---

## Sources

- [Google Cloud Vision API Pricing](https://cloud.google.com/vision/pricing)
- [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Gemini Developer API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Anthropic Vision Documentation](https://platform.claude.com/docs/en/docs/build-with-claude/vision)
- [Anthropic Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Scene Detection Policies and Keyframe Extraction (arXiv 2506.00667, 2025)](https://arxiv.org/abs/2506.00667)
- [FFmpeg Frame Extraction Methods (RenderIO)](https://renderio.dev/blogs/ffmpeg-extract-frames/)
- [LSR-YOLO Retail Product Detection (PLOS One, 2025)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0334216)
- [ZXing vs ZBar vs Dynamsoft Benchmark](https://www.dynamsoft.com/codepool/python-zxing-zbar-barcode.html)
- [Optimizing Product Deduplication with Multimodal Embeddings (arXiv 2509.15858)](https://arxiv.org/abs/2509.15858)
- [AI Shelf Price Verification (Roboflow)](https://blog.roboflow.com/ai-shelf-price-verification/)
- [Price Tag OCR Extraction (Klippa)](https://www.klippa.com/en/blog/information/price-tag-ocr/)
- [Retail Shelf Monitoring with Edge AI 2026 (CamThink)](https://www.camthink.ai/blog/retail-shelf-monitoring-edge-ai-guide/)
- [NestJS BullMQ Queues Documentation](https://docs.nestjs.com/techniques/queues)
- [OCR Accuracy Comparison 2025 (SparkCo)](https://sparkco.ai/blog/ocr-accuracy-comparison-2025-benchmark-analysis)
- [Gemini 2.5 Flash API Pricing 2026](https://pricepertoken.com/pricing-page/model/google-gemini-2.5-flash)
- [Claude Sonnet 4.5 API Pricing 2026](https://pricepertoken.com/pricing-page/model/anthropic-claude-sonnet-4.5)
