import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import os from 'os';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://tdwcenpafrpwhnzswlou.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd2NlbnBhZnJwd2huenN3bG91Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTE1NDM4MSwiZXhwIjoyMDk2NzMwMzgxfQ.rq73IckDa6_vA3RQJuDg7AAcGI32stC6ILhKVilRHz0';
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to generate PDF buffer
function generatePDFBuffer(meta, data, logoText, headerColor, footerText) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header Banner
      doc.rect(40, 40, doc.page.width - 80, 60)
         .fill(headerColor || '#0A0F1E');
      
      doc.fillColor('#FFFFFF')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text(logoText || 'Skadomation System', 55, 62);

      doc.fillColor('#F1F5F9')
         .fontSize(9)
         .font('Helvetica')
         .text(meta.type || 'Historian Shift Summary', doc.page.width - 200, 65, { width: 150, align: 'right' });

      // Title & metadata
      doc.fillColor('#0A0F1E')
         .fontSize(13)
         .font('Helvetica-Bold')
         .text(meta.name, 40, 115);

      doc.fontSize(8.5)
         .font('Helvetica')
         .fillColor('#4B5563');
      
      doc.text(`Time Scope: ${meta.dateInfo || (meta.startDate + ' to ' + meta.endDate)}`, 40, 133);
      doc.text(`Generated At: ${meta.generatedAt || new Date().toISOString()} | Compiled By: ${meta.createdBy || 'System'}`, 40, 147);

      // Section 1: Tag Stats Summary
      doc.fillColor('#0A0F1E')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('TAG STATS SUMMARY', 40, 175);

      let y = 192;
      const headers = ['Index', 'Tag Name', 'Value', 'Unit', 'Min', 'Max', 'Avg', 'Samples', 'Quality'];
      const colWidths = [35, 120, 45, 35, 45, 45, 45, 50, 50];

      // Draw header row
      doc.rect(40, y, doc.page.width - 80, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
      let x = 45;
      headers.forEach((h, i) => {
        doc.text(h, x, y + 6, { width: colWidths[i] - 5, align: i >= 2 && i !== 3 ? 'right' : 'left' });
        x += colWidths[i];
      });
      y += 20;

      // Draw rows
      doc.font('Helvetica').fontSize(7.5);
      (data.summaries || []).forEach((s, idx) => {
        if (y > doc.page.height - 70) {
          doc.addPage();
          y = 40;
        }
        // Zebra striping background
        if (idx % 2 === 0) {
          doc.rect(40, y, doc.page.width - 80, 18).fill('#F8FAFC');
        }
        doc.fillColor('#1E293B');
        
        let rx = 45;
        doc.text(String(s.tagIndex), rx, y + 5);
        rx += colWidths[0];
        doc.text(String(s.tagName), rx, y + 5, { width: colWidths[1] - 5 });
        rx += colWidths[1];
        doc.text(s.count > 0 ? s.current.toFixed(s.decimalPlaces) : '—', rx, y + 5, { width: colWidths[2] - 5, align: 'right' });
        rx += colWidths[2];
        doc.text(String(s.unit), rx, y + 5, { width: colWidths[3] - 5 });
        rx += colWidths[3];
        doc.text(s.count > 0 ? s.min.toFixed(s.decimalPlaces) : '—', rx, y + 5, { width: colWidths[4] - 5, align: 'right' });
        rx += colWidths[4];
        doc.text(s.count > 0 ? s.max.toFixed(s.decimalPlaces) : '—', rx, y + 5, { width: colWidths[5] - 5, align: 'right' });
        rx += colWidths[5];
        doc.text(s.count > 0 ? s.avg.toFixed(s.decimalPlaces) : '—', rx, y + 5, { width: colWidths[6] - 5, align: 'right' });
        rx += colWidths[6];
        doc.text(String(s.count), rx, y + 5, { width: colWidths[7] - 5, align: 'right' });
        rx += colWidths[7];
        doc.text(`${s.goodPct.toFixed(1)}%`, rx, y + 5, { width: colWidths[8] - 5, align: 'right' });

        y += 18;
      });

      // Section 2: Incidents Log
      y += 20;
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = 40;
      }

      doc.fillColor('#0A0F1E')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('INCIDENTS LOG', 40, y);
      y += 15;

      const incHeaders = ['Timestamp', 'Index', 'Tag Name', 'Value', 'Status', 'Marker'];
      const incColWidths = [110, 35, 120, 50, 50, 100];

      // Draw inc header row
      doc.rect(40, y, doc.page.width - 80, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
      let ix = 45;
      incHeaders.forEach((h, i) => {
        doc.text(h, ix, y + 6, { width: incColWidths[i] - 5, align: i === 3 || i === 4 ? 'right' : 'left' });
        ix += incColWidths[i];
      });
      y += 20;

      // Draw inc rows
      doc.font('Helvetica').fontSize(7.5);
      (data.incidents || []).forEach((inc, idx) => {
        if (y > doc.page.height - 70) {
          doc.addPage();
          y = 40;
        }
        if (idx % 2 === 0) {
          doc.rect(40, y, doc.page.width - 80, 18).fill('#F8FAFC');
        }
        doc.fillColor('#1E293B');

        let rx = 45;
        doc.text(String(inc.timestamp), rx, y + 5);
        rx += incColWidths[0];
        doc.text(String(inc.tagIndex), rx, y + 5);
        rx += incColWidths[1];
        doc.text(String(inc.tagName), rx, y + 5, { width: incColWidths[2] - 5 });
        rx += incColWidths[2];
        doc.text(String(inc.val), rx, y + 5, { width: incColWidths[3] - 5, align: 'right' });
        rx += incColWidths[3];
        doc.text(String(inc.status), rx, y + 5, { width: incColWidths[4] - 5, align: 'right' });
        rx += incColWidths[4];
        doc.text(String(inc.marker), rx, y + 5, { width: incColWidths[5] - 5 });

        y += 18;
      });

      // Add footer compliance text on all pages
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.rect(40, doc.page.height - 40, doc.page.width - 80, 0.5).fill('#CBD5E1');
        doc.fillColor('#64748B')
           .fontSize(7)
           .font('Helvetica')
           .text(footerText || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.', 40, doc.page.height - 32, { width: doc.page.width - 80, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Helper function to generate Excel buffer
function generateExcelBuffer(meta, data) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Tag Stats Summary
  const summaryRows = (data.summaries || []).map(s => ({
    'Tag Index': s.tagIndex,
    'Tag Name': s.tagName,
    'Current Value': s.count > 0 ? Number(s.current.toFixed(s.decimalPlaces)) : null,
    'Unit': s.unit,
    'Min': s.count > 0 ? Number(s.min.toFixed(s.decimalPlaces)) : null,
    'Max': s.count > 0 ? Number(s.max.toFixed(s.decimalPlaces)) : null,
    'Average': s.count > 0 ? Number(s.avg.toFixed(s.decimalPlaces)) : null,
    'Samples Count': s.count,
    'Quality Index': `${s.goodPct.toFixed(1)}%`
  }));
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tag Summary');

  // Sheet 2: Incidents Log
  const incidentRows = (data.incidents || []).map(inc => ({
    'Timestamp': inc.timestamp,
    'Tag Index': inc.tagIndex,
    'Tag Name': inc.tagName,
    'Value': inc.val,
    'Status': inc.status,
    'Marker': inc.marker
  }));
  const wsIncidents = XLSX.utils.json_to_sheet(incidentRows);
  XLSX.utils.book_append_sheet(wb, wsIncidents, 'Incidents Log');

  // Sheet 3: Telemetry Event Log (Full list rows)
  const fullRows = (data.rows || []).map(r => ({
    'Timestamp': r.DateAndTime,
    'Millitm': r.Millitm,
    'Tag Index': r.TagIndex,
    'Value': r.Val,
    'Status': r.Status,
    'Marker': r.Marker || ''
  }));
  const wsFull = XLSX.utils.json_to_sheet(fullRows);
  XLSX.utils.book_append_sheet(wb, wsFull, 'Telemetry Event Log');

  // Write to buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { smtpConfig, recipient, to, cc, bcc, subject, message, reportData } = req.body;
  const targetTo = to || recipient;

  if (!smtpConfig || !targetTo || !subject || !message) {
    return res.status(400).json({ error: 'Missing required parameters (smtpConfig, to/recipient, subject, message)' });
  }

  const host = smtpConfig.host || smtpConfig.smtpHost;
  const port = parseInt(smtpConfig.port || smtpConfig.smtpPort) || 587;
  const username = smtpConfig.username || smtpConfig.smtpUser;
  const password = smtpConfig.password || smtpConfig.smtpPass;
  const secure = port === 465;
  const logoText = smtpConfig.logoText || smtpConfig.logo_text || smtpConfig.templateLogoText || 'Skadomation System';
  const headerColor = smtpConfig.headerColor || smtpConfig.header_color || smtpConfig.templateHeaderColor || '#0A0F1E';
  const footerText = smtpConfig.footerText || smtpConfig.footer_text || smtpConfig.templateFooterText || 'CONFIDENTIAL — AUTOMATED REPORT DISPATCHED BY SKADOMATION HISTORIAN MODULE.';

  if (!host || !username || !password) {
    return res.status(400).json({ error: 'Incomplete SMTP credentials configuration (Host, Username, and Password are required)' });
  }

  let attachments = [];
  const tempDir = os.tmpdir();

  // Generate attachments if report data is provided
  if (reportData && reportData.meta && reportData.data) {
    const { meta, data } = reportData;
    console.log(`[SMTP] Processing report data for: ${meta.name}`);

    const safeName = meta.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    // 1. PDF Attachment Generation
    try {
      console.log('[SMTP] Initiating PDF report generation...');
      const pdfBuffer = await generatePDFBuffer(meta, data, logoText, headerColor, footerText);
      console.log('[SMTP] PDF generation completed successfully.');

      const pdfPath = path.join(tempDir, `report_${safeName}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      const pdfSize = fs.statSync(pdfPath).size;

      console.log(`[SMTP] Attachment file path: ${pdfPath}`);
      console.log(`[SMTP] Attachment file size: ${pdfSize} bytes`);

      attachments.push({
        filename: `${meta.name}.pdf`,
        path: pdfPath
      });
    } catch (pdfError) {
      console.error('[SMTP] PDF generation failed with error:', pdfError);
      return res.status(500).json({ error: `PDF generation failed: ${pdfError.message}` });
    }

    // 2. Excel Attachment Generation
    try {
      console.log('[SMTP] Initiating Excel report generation...');
      const xlsxBuffer = generateExcelBuffer(meta, data);
      console.log('[SMTP] Excel generation completed successfully.');

      const xlsxPath = path.join(tempDir, `report_${safeName}.xlsx`);
      fs.writeFileSync(xlsxPath, xlsxBuffer);
      const xlsxSize = fs.statSync(xlsxPath).size;

      console.log(`[SMTP] Attachment file path: ${xlsxPath}`);
      console.log(`[SMTP] Attachment file size: ${xlsxSize} bytes`);

      attachments.push({
        filename: `${meta.name}.xlsx`,
        path: xlsxPath
      });
    } catch (xlsxError) {
      console.error('[SMTP] Excel generation failed with error:', xlsxError);
      return res.status(500).json({ error: `Excel generation failed: ${xlsxError.message}` });
    }

    console.log(`[SMTP] SMTP attachment count: ${attachments.length}`);
  }

  try {
    console.log(`[SMTP] Attempting connection to ${host}:${port}...`);
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: port,
      secure: secure,
      auth: {
        user: username.trim(),
        pass: password,
      },
      tls: {
        rejectUnauthorized: false // avoids handshake failures on self-signed industrial relay certs
      },
      connectionTimeout: 8000,
      greetingTimeout: 5000
    });

    const info = await transporter.sendMail({
      from: `"${logoText}" <${username.trim()}>`,
      to: Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
      cc: Array.isArray(cc) ? cc.join(', ') : cc,
      bcc: Array.isArray(bcc) ? bcc.join(', ') : bcc,
      subject: subject,
      text: message,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #060b18; color: #f1f5f9; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 1px solid #1e2d4a;">
          <div style="background-color: ${headerColor}; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 1px solid #1e2d4a; color: white;">
            <h2 style="margin: 0; font-size: 1.2rem; font-weight: 600; letter-spacing: -0.5px;">${logoText}</h2>
          </div>
          <div style="padding: 24px 16px; min-height: 150px; line-height: 1.6; font-size: 0.95rem; color: #cbd5e1; background-color: #0d1526;">
            ${message.replace(/\n/g, '<br/>')}
          </div>
          <div style="padding: 16px; border-radius: 0 0 8px 8px; border-top: 1px solid #1e2d4a; font-size: 0.72rem; color: #7c9dbf; text-align: center; background-color: #0d1526;">
            ${footerText}
          </div>
        </div>
      `,
      attachments: attachments
    });

    console.log('[SMTP] Email dispatched successfully:', info.messageId);

    // Log successful delivery to report_history
    try {
      const dbRow = {
        id: 'rep-' + Date.now(),
        name: subject,
        type: message.substring(0, 150) || 'Production Email Report',
        date_range: new Date().toISOString().split('T')[0],
        shift: 'Email Delivery Log',
        created_by: username,
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'SENT',
        attachments_sent: reportData ? 'PDF, Excel' : 'None'
      };
      await supabase.from('report_history').insert(dbRow);
      console.log('[SMTP] Delivery successfully logged in report_history.');
    } catch (dbEx) {
      console.error('[SMTP] Exception logging delivery in database:', dbEx);
    }
    
    // Clean up temporary files from disk
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch (cleanupErr) {
        console.warn(`[SMTP] Error deleting temporary file ${att.path}:`, cleanupErr);
      }
    });

    return res.status(200).json({ status: 'success', messageId: info.messageId });
  } catch (error) {
    console.error('[SMTP] Connection or sending failed:', error);

    // Log failed delivery to report_history
    try {
      const dbRow = {
        id: 'rep-' + Date.now(),
        name: subject,
        type: `FAILED: ${error.message.substring(0, 80)}`,
        date_range: new Date().toISOString().split('T')[0],
        shift: 'Email Delivery Log',
        created_by: username,
        recipients: [
          Array.isArray(targetTo) ? targetTo.join(', ') : targetTo,
          Array.isArray(cc) ? cc.join(', ') : cc,
          Array.isArray(bcc) ? bcc.join(', ') : bcc
        ].filter(Boolean).join(' | '),
        delivery_time: new Date().toISOString(),
        delivery_status: 'FAILED',
        attachments_sent: reportData ? 'PDF, Excel' : 'None'
      };
      await supabase.from('report_history').insert(dbRow);
    } catch (dbEx) {
      console.error('[SMTP] Exception logging failed delivery:', dbEx);
    }
    
    // Clean up files in case of error
    attachments.forEach(att => {
      try {
        if (fs.existsSync(att.path)) {
          fs.unlinkSync(att.path);
        }
      } catch (cleanupErr) {
        /* ignored */
      }
    });

    return res.status(500).json({ error: `SMTP Connection/Auth failure: ${error.message}` });
  }
}
