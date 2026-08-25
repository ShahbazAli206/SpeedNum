"use client";

/**
 * CSV/Excel/PDF export, shared by every admin table (Clients/Users/Team via
 * DataTable, plus the Services catalogue and the Superadmin tenants console,
 * which render their own tables instead of using DataTable).
 *
 * Pulled out of DataTable so a second and third call site didn't have to
 * re-implement formula-injection sanitising and the three file writers.
 */

import { useState } from "react";

import { useToast } from "@/components/toast";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

// Spreadsheet formula injection: Excel/Sheets treat a cell whose first
// character is one of these as a formula, even in files we generate
// ourselves from plain data. Prefixing with a quote forces literal text —
// the standard OWASP CSV-injection mitigation.
export function sanitizeForSpreadsheet(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function buildExportRows<T>(rows: T[], columns: ExportColumn<T>[], sanitize: boolean) {
  const header = columns.map((column) => column.header);
  const body = rows.map((row) =>
    columns.map((column) => {
      const text = String(column.value(row));
      return sanitize ? sanitizeForSpreadsheet(text) : text;
    }),
  );
  return { header, body };
}

export function useSpreadsheetExport<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  exportName: string,
) {
  const toast = useToast();
  const session = useSession();
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    const { header, body } = buildExportRows(rows, columns, true);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");

    // A leading UTF-8 BOM so Excel on Windows doesn't mis-render accented
    // or non-Latin characters when the file is opened directly.
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export ready", `${rows.length} rows downloaded as CSV.`);
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const { header, body } = buildExportRows(rows, columns, true);
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet("Export");
      sheet.addRow(header).font = { bold: true };
      for (const line of body) sheet.addRow(line);
      sheet.columns.forEach((column) => {
        column.width = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportName}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", `${rows.length} rows downloaded as Excel.`);
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { Document, Page, View, Text, StyleSheet, Font, pdf } = await import(
        "@react-pdf/renderer"
      );
      // Table cells hold long unbroken tokens (emails, URLs) that don't fit a
      // flex-width cell, so split only long tokens into characters — short
      // words are unaffected — so the layout engine can break them.
      Font.registerHyphenationCallback((word) => (word.length > 20 ? word.split("") : [word]));

      const { header, body } = buildExportRows(rows, columns, false);
      const title = exportName
        .replace(/^speednum-/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const tenantName = session.me?.tenant?.name ?? null;
      const generated = `Generated ${formatDateTime(new Date().toISOString())}`;

      const styles = StyleSheet.create({
        page: { padding: 28, fontSize: 8, fontFamily: "Helvetica", color: "#1e293b" },
        headerRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottomWidth: 1,
          borderBottomColor: "#cdd6e2",
          paddingBottom: 8,
          marginBottom: 8,
        },
        titleBlock: { flexDirection: "column" },
        title: { fontSize: 13, fontFamily: "Helvetica-Bold" },
        tenant: { fontSize: 9, color: "#64748b", marginTop: 2 },
        meta: { fontSize: 8, color: "#94a3b8" },
        tHeadRow: {
          flexDirection: "row",
          backgroundColor: "#f1f5f9",
          borderBottomWidth: 1,
          borderBottomColor: "#cdd6e2",
          paddingVertical: 4,
        },
        tRow: {
          flexDirection: "row",
          borderBottomWidth: 0.5,
          borderBottomColor: "#e4e9f0",
          paddingVertical: 3,
        },
        cell: { flex: 1, paddingHorizontal: 3 },
        headCell: { flex: 1, paddingHorizontal: 3, fontFamily: "Helvetica-Bold", color: "#475569" },
      });

      const PdfDocument = (
        <Document title={title}>
          <Page size="A4" orientation="landscape" style={styles.page} wrap>
            <View style={styles.headerRow} fixed>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{title}</Text>
                {tenantName ? <Text style={styles.tenant}>{tenantName}</Text> : null}
              </View>
              <Text style={styles.meta}>{generated}</Text>
            </View>
            <View style={styles.tHeadRow} fixed>
              {header.map((cell, index) => (
                <Text key={index} style={styles.headCell}>
                  {cell}
                </Text>
              ))}
            </View>
            {body.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tRow} wrap={false}>
                {row.map((cell, cellIndex) => (
                  <Text key={cellIndex} style={styles.cell}>
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </Page>
        </Document>
      );

      const blob = await pdf(PdfDocument).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", `${rows.length} rows downloaded as PDF.`);
    } finally {
      setExporting(false);
    }
  };

  return { exportCsv, exportXlsx: () => void exportXlsx(), exportPdf: () => void exportPdf(), exporting };
}
