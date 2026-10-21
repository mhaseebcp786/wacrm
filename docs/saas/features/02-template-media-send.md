# Feature 02 — Template Media Send (Video + PDF)

**Status:** ✅ Implemented  
**Branch:** `saas-main`  
**Implemented:** 2026-10-16

---

## What it does

Extends the template **send** paths (Inbox picker + Broadcast wizard Step 3) to properly handle templates with **video** or **document (PDF)** headers.

Previously, the upstream code only showed an image icon and URL field for all media header types. This feature:
- Shows the **correct icon** per type (camera → image, film → video, file-text → document)
- Allows agents to **upload or enter a URL** for video/PDF headers before sending
- In the Inbox: adds a **media confirmation step** (modal) when picking a template with a non-image media header
- In Broadcasts: replaces the generic image URL input with a type-aware `TemplateHeaderMediaInput` component

> [!NOTE]
> Template **creation** with video/document headers was already supported by the upstream author.
> This feature only fills the gap in the **send** paths.

---

## Meta API used

Standard template message send: `POST /{phone-number-id}/messages` with `type: "template"`.
The `components` array can include a `HEADER` component with `type: "video"` or `type: "document"` and a `link` URL.

---

## Our implementation files

### SaaS-owned
| File | Purpose |
|------|---------|
| `src/saas/components/template-header-media-input.tsx` | Reusable component: correct icon, URL input, file upload button, type-appropriate preview |
| `src/saas/components/template-picker-with-media.tsx` | Wraps upstream `TemplatePicker` — adds a post-pick media confirmation step for video/document templates |

### Upstream files touched (minimal hooks only)
| File | Change | Lines added |
|------|--------|-------------|
| `src/components/inbox/message-thread.tsx` | 1 import + replace `<TemplatePicker>` with `<TemplatePickerWithMedia>` + add `headerMediaUrl` param to `handleSendTemplate` | +3 effective lines |
| `src/components/broadcasts/step3-personalize.tsx` | 1 import + replace inner div contents of the `{mediaHeaderType && (...)}` block with `<TemplateHeaderMediaInput>` | net −38 lines (cleanup) |
| `messages/en.json` etc. | New i18n keys under `Broadcasts.wizard.personalize` and `Inbox.templatePicker` | +16 keys |

### Test files
| File | Tests |
|------|-------|
| `src/saas/components/template-media-header.test.ts` | Component integration tests |

---

## Upstream sync comparison guidance

**Search upstream for:** `header_type`, `headerMediaUrl`, `video.*header`, `document.*header`, `TemplatePicker.*media`

**If upstream adds media header send support:**
1. Check if they add a media confirmation step in `message-thread.tsx` — if so, we can remove `TemplatePickerWithMedia` and revert the import + 3-line hook.
2. Check if they update `step3-personalize.tsx` to show type-aware media inputs — if so, we can remove `TemplateHeaderMediaInput` and revert the import.
3. Check i18n keys — merge any missing translations from upstream into our locale files.

**Decision rule:** If upstream implements equivalent media send UX → remove `src/saas/components/template-header-media-input.tsx` and `template-picker-with-media.tsx`, revert the 2 upstream file hooks. Update status to `Merged → Upstream`.

---

## 2026-10-21 update (LeminAi parity)
- Document headers now send a `filename` (derived from the URL) so recipients see a real name.
- Validation is shared (`src/saas/lib/whatsapp/media-specs.ts`): image jpg/jpeg/png ≤ 5 MB, video mp4/3gp ≤ 16 MB, document pdf/doc/docx/xls/xlsx/ppt/pptx/txt (template header sample: PDF only); pasted URLs are type-checked when they carry an extension. Error toasts are translated (`SaasTemplates` namespace).
- The confirm step shows a PDF row preview (icon + file name).
- Known gap: scheduled/resumed broadcasts do not forward per-send media (upstream limitation); they use the template's stored sample URL.

## Key constraints

- Video headers: MP4 or 3GPP, public HTTPS URL
- Document headers: PDF, Word, PowerPoint, Excel, or plain text — public HTTPS URL
- The file upload calls `uploadAccountMedia('chat-media', file)` from `@/lib/storage/upload-media`
- Carousel cards do NOT support document headers (image/video only) — this is a separate feature
