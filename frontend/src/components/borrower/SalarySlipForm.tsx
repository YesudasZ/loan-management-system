'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ApiError, apiRequest } from '@/lib/api-client';
import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES } from '@/lib/constants';
import { formatDate, formatFileSize } from '@/lib/format';
import type { SalarySlip } from '@/types/loan';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** Quick check before uploading; the server also checks the file's real type (magic bytes). */
function checkFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) return 'Choose a PDF, JPG or PNG file.';
  if (file.size > MAX_UPLOAD_BYTES) return 'The file must be 5 MB or smaller.';
  return null;
}

const TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};

interface SalarySlipFormProps {
  currentSlip: SalarySlip | null;
  onUploaded: () => void;
}

export function SalarySlipForm({ currentSlip, onUploaded }: SalarySlipFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    setError(chosen ? checkFile(chosen) : null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    try {
      await apiRequest('/borrower/salary-slip', { method: 'POST', formData });
      toast.success('Salary slip uploaded.');
      setFile(null);
      onUploaded();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {currentSlip && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-border bg-accent-soft p-4 text-sm text-accent-strong">
          <p>
            Uploaded: {TYPE_LABELS[currentSlip.contentType] ?? 'File'} ·{' '}
            {formatFileSize(currentSlip.sizeBytes)} · {formatDate(currentSlip.uploadedAt)}
          </p>
          <a
            href="/api/v1/borrower/salary-slip"
            target="_blank"
            rel="noopener"
            className="font-medium text-primary hover:underline"
          >
            View slip
          </a>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="salary-slip-file" className="text-sm font-medium text-slate-700">
            {currentSlip ? 'Replace salary slip' : 'Salary slip'}
          </label>
          <input
            id="salary-slip-file"
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            aria-describedby="salary-slip-hint"
            className="rounded-md border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-primary"
          />
          <p id="salary-slip-hint" className="text-xs text-slate-500">
            PDF, JPG or PNG, up to 5 MB. Demo system: please upload a sample, not a real payslip.
          </p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" isLoading={isUploading} disabled={!file}>
            Upload
          </Button>
          {currentSlip && (
            <Link
              href="/apply/loan"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Continue to loan amount
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
