import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface QrCard {
  roomNumber: string;
  qrUrl: string;
}

const COLORS = { ink: '#16213a', muted: '#6b7280', gold: '#c8913a' };

/** One A5 table card per room: hotel name, a short instruction, the QR code and the room number. */
export async function renderQrCodePdf(hotelName: string, cards: QrCard[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', margin: 40, autoFirstPage: false, info: { Title: `${hotelName} QR codes` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  for (const card of cards) {
    await drawCard(doc, hotelName, card);
  }
  doc.end();
  return finished;
}

async function drawCard(doc: PDFKit.PDFDocument, hotelName: string, card: QrCard): Promise<void> {
  doc.addPage();
  const width = doc.page.width - 80;
  const qrSize = 220;
  const qrImage = await QRCode.toBuffer(card.qrUrl, { type: 'png', margin: 1, width: 600, errorCorrectionLevel: 'M' });

  doc.fillColor(COLORS.gold).font('Helvetica-Bold').fontSize(14).text(hotelName, 40, 50, { width, align: 'center' });
  doc.fillColor(COLORS.ink).font('Times-Roman').fontSize(26).text('Room service & requests', 40, 90, { width, align: 'center' });
  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(11)
    .text('Scan with your phone camera. No app needed.', 40, 160, { width, align: 'center' });
  doc.image(qrImage, (doc.page.width - qrSize) / 2, 200, { width: qrSize, height: qrSize });
  doc.fillColor(COLORS.ink).font('Times-Roman').fontSize(34).text(`Room ${card.roomNumber}`, 40, 450, { width, align: 'center' });
}
