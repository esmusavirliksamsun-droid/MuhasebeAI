
export interface VatDetail {
  rate: number;
  taxAmount: number;
  grossAmount: number; // KDV Dahil Tutar
}

// Portal Giriş Bilgileri (Tek seferlik)
export interface PortalSettings {
  loginUrl: string;
  productNo: string;
  email: string;
  password: string;
  period: string; // Örn: 2025
}

export interface Company {
  id: string;
  name: string; // Muhasebe programındaki tam firma adı
  matchKeywords: string; // OCR eşleşmesi için anahtar kelimeler
  email?: string; // Tahakkuk gönderimi için
  phone?: string; // WhatsApp bilgilendirmesi için (905xxxxxxxxx)
}

// YENİ: Robot Ayarları
export interface RobotSettings {
  email: string;
  appPassword: string; // Gmail Uygulama Şifresi
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  sendingMode: 'all' | 'summary_only' | 'receipts_only'; // YENİ: Gönderim Modu
}

export interface ZReportData {
  id: string; // Unique ID for list rendering
  fileName: string;
  date: string; // DD.MM.YYYY format
  zReportNo: string;
  posName: string; // Banka Adı
  totalSales: number;
  cashAmount: number; // KASA
  creditCardAmount: number; // KREDİ KARTI
  vatDetails: VatDetail[];
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  warnings?: string[];
  companyId?: string; // Hangi firmaya ait olduğu
}

// YENİ: Genişletilmiş Tahakkuk Verisi Tipleri
export type TaxType = 
  | 'KDV1' 
  | 'KDV2' 
  | 'MUHSGK' 
  | 'SGK' 
  | 'GGV'        // Gelir Geçici Vergi
  | 'KGV'        // Kurum Geçici Vergi
  | 'KV'         // Kurumlar Vergisi
  | 'GV'         // Gelir Vergisi (Yıllık)
  | 'KONAKLAMA'  // Konaklama Vergisi
  | 'TURIZM'     // Turizm Payı
  | 'POSET'      // Geri Kazanım Katılım Payı
  | 'DIGER';

export interface TaxDocumentData {
  id: string;
  fileName: string;
  companyName: string; // OCR'dan gelen ham isim
  taxType: TaxType;
  amount: number;
  period: string; // Örn: "Ocak 2025"
  referenceNumber: string; // Barkod No veya Sicil No
  dueDate?: string; // YENİ: Vade Tarihi (DD.MM.YYYY)
  status: 'success' | 'error';
  companyId?: string; // Eşleşen firma ID'si
  originalFile?: File; // YENİ: Orijinal dosya referansı (ZIP için gerekli)
}

export interface ProcessedResult {
  fileName: string;
  data: ZReportData[];
}
