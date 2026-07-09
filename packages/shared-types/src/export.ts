export type ExportFormat = 'txt' | 'docx' | 'pdf';

export interface ExportOptions {
  format:             ExportFormat;
  include_timestamps: boolean;
}
