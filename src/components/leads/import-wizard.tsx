"use client";

import { useActionState, useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage, Select } from "@/components/ui/form";
import { CsvParseError, parseCsv, type ParsedCsv } from "@/lib/csv";
import {
  autoDetectMapping,
  LEAD_IMPORT_FIELDS,
  type LeadImportFieldKey,
  type LeadImportMapping,
} from "@/lib/leads/import";
import { initialFormState } from "@/lib/form";
import { importLeadsAction } from "@/server/actions/imports";

const MAX_BYTES = 8 * 1024 * 1024;

export function ImportWizard() {
  const formId = useId();
  const [state, formAction] = useActionState(importLeadsAction, initialFormState);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [mapping, setMapping] = useState<LeadImportMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function handleFile(file: File | undefined) {
    setParsed(null);
    setMapping({});
    setFilename("");
    setFileError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Choose a file with a .csv extension.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("The file is larger than 8 MB. Split it into smaller files.");
      return;
    }

    setReading(true);
    try {
      const text = await file.text();
      const result = parseCsv(text);
      if (result.headers.length === 0 || result.rows.length === 0) {
        setFileError("The file needs a header row and at least one data row.");
        return;
      }
      setParsed(result);
      setFilename(file.name);
      setMapping(autoDetectMapping(result.headers));
    } catch (error) {
      setFileError(
        error instanceof CsvParseError
          ? error.message
          : "The file could not be read. Save it as UTF-8 CSV and try again.",
      );
    } finally {
      setReading(false);
    }
  }

  const companyColumn = mapping.companyName;
  const canSubmit = Boolean(parsed && companyColumn !== undefined);
  const preview = parsed?.rows.slice(0, 3) ?? [];

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor={`${formId}-file`} className="label">
          CSV file
        </label>
        <label
          htmlFor={`${formId}-file`}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-canvas/60 px-6 py-10 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <UploadCloud className="size-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-ink">
            {filename || (reading ? "Reading file…" : "Choose a CSV file")}
          </span>
          <span className="text-[11px] text-muted">
            Up to 5,000 rows and 8 MB. The first row must contain column headers.
          </span>
          <input
            id={`${formId}-file`}
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="sr-only"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
        </label>
        {fileError ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            {fileError}
          </p>
        ) : null}
      </div>

      {parsed ? (
        <>
          <div className="rounded-xl border border-line bg-canvas/60 px-4 py-3 text-[12px] leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">
              {parsed.rows.length.toLocaleString()} data row
              {parsed.rows.length === 1 ? "" : "s"}
            </span>{" "}
            and {parsed.headers.length} column{parsed.headers.length === 1 ? "" : "s"} detected.
            Duplicate rows in the file are skipped automatically.
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-ink">Map columns</h3>
              <span className="text-[11px] text-muted">Company name is required</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LEAD_IMPORT_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label
                    htmlFor={`${formId}-map-${field.key}`}
                    className="label flex items-center gap-1.5"
                  >
                    {field.label}
                    {field.required ? (
                      <span className="text-[10px] font-bold uppercase text-danger">required</span>
                    ) : null}
                  </label>
                  <Select
                    id={`${formId}-map-${field.key}`}
                    name={`map_${field.key}`}
                    value={mapping[field.key] === undefined ? "" : String(mapping[field.key])}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMapping((current) => {
                        const next = { ...current };
                        if (value === "") delete next[field.key];
                        else next[field.key] = Number.parseInt(value, 10);
                        return next;
                      });
                    }}
                  >
                    <option value="">Not mapped</option>
                    {parsed.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </Select>
                  {state.fieldErrors?.[field.key]?.[0] ? (
                    <p className="text-xs font-medium text-danger">
                      {state.fieldErrors[field.key][0]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {companyColumn === undefined ? (
              <p className="mt-2 text-xs font-medium text-danger">
                Map the company name column to continue.
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 font-display text-sm font-semibold text-ink">Preview</h3>
            <div className="overflow-x-auto scrollbar-thin rounded-xl border border-line">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-line bg-canvas/70">
                    {parsed.headers.slice(0, 6).map((header, index) => (
                      <th
                        key={`${header}-${index}`}
                        className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted"
                      >
                        {header || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.line} className="border-b border-line/60 last:border-0">
                      {row.values.slice(0, 6).map((value, index) => (
                        <td
                          key={index}
                          className="max-w-[220px] truncate px-3 py-2 text-[12px] text-ink-soft"
                        >
                          {value || <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl border border-line bg-canvas/60 px-4 py-3">
        <input
          type="checkbox"
          name="rightsConfirmed"
          value="on"
          required
          className="mt-0.5 size-4 accent-[var(--color-brand)]"
        />
        <span className="text-[12px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">I confirm I hold the rights to use this data.</span>{" "}
          LeadPilot will record the file, timestamp, and importing user in the audit log. Do not
          upload data you are not licensed to process.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={!canSubmit} pendingLabel="Importing…">
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          Import leads
        </SubmitButton>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
          Rows are deduplicated against existing leads by email, domain, then company + location.
        </span>
      </div>

      <FormMessage status={state.status} message={state.message} />

      {parsed ? (
        <Alert tone="info" title="What gets stored">
          Imported rows keep their evidence URL and are marked partially verified when one is
          present. Missing fields stay empty — LeadPilot does not guess emails or phone numbers.
        </Alert>
      ) : null}
    </form>
  );
}

export function ImportSummaryBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
      CSV import is available on every plan while monthly lead limits allow it.
    </span>
  );
}

export type { LeadImportFieldKey };
