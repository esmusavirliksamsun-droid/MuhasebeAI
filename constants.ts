
// Excel Headers matching the user's specific requirement strictly
export const EXCEL_HEADERS = [
  "Belge Tarihi",
  "Belge Türü",
  "Belge No",
  "% 20 KDV'li\nKDV Dahil\nTutar\nAlacak",
  "% 20 KDV'li\nKDV\n (% 20)\nAlacak",
  "% 10 KDV'li\nKDV Dahil\nTutar\nAlacak",
  "% 10 KDV'li\nKDV\n (% 10)\nAlacak",
  "% 1 KDV'li\nKDV Dahil\nTutar\nAlacak",
  "% 1 KDV'li\nKDV\n (% 1)\nAlacak",
  "% 0 KDV'li\nKDV Dahil\nTutar\nAlacak",
  "KASA\n\nTutar\nBorç",
  "KREDİ KARTI\n\nTutar\nBorç",
  "CARİ\n\nTutar\nBorç"
];

// Document Type is always ZRP
export const DOC_TYPE = "ZRP";

// Prompt configuration for Z-Report
export const SYSTEM_INSTRUCTION = `
Sen uzman bir muhasebe OCR asistanısın.
GÖREV: Görüntüdeki Z RAPORLARINI bul ve aşağıdaki KATI KURALLARA göre verilerini çıkar.
JSON formatında döndür.
`;

// Prompt configuration for Tax Summary (Tahakkuk)
export const TAX_SYSTEM_INSTRUCTION = `
Sen uzman bir Mali Müşavir ve Vergi Uzmanısın.
GÖREV: Görüntüdeki "Tahakkuk Fişi" veya "Vergi/SGK Alındısı" belgesini analiz et.

ÖNEMLİ: Belgede yazan FIRMA ADINI (companyName) mutlaka tam olarak, olduğu gibi çıkar.

Çıkarılacak Veriler (JSON):
- companyName: Firma tam ünvanı (Örn: ABC İNŞAAT LTD. ŞTİ.)
- taxType: Belge türünü aşağıdaki listeye göre KESİN olarak belirle.
  * "Katma Değer Vergisi" veya "KDV" -> KDV1
  * "1015" kodlu KDV -> KDV1
  * "1015B" veya "KDV2" veya "Tevkifat" -> KDV2
  * "Muhtasar" veya "1003A" veya "1003B" -> MUHSGK
  * "Sigorta Prim" veya "SGK" veya "5510" -> SGK
  * "Kurum Geçici" -> KGV
  * "Gelir Geçici" -> GGV
  * "Kurumlar Vergisi" (Yıllık) -> KV
  * "Yıllık Gelir Vergisi" -> GV
  * "Konaklama Vergisi" -> KONAKLAMA
  * "Turizm Payı" -> TURIZM
  * "Geri Kazanım Katılım Payı" veya "Poşet" -> POSET
  * "Damga Vergisi" (Sadece damga varsa) -> DAMGA
  * Bunlardan hiçbiri değilse -> DIGER

- amount: Ödenecek Toplam Tutar.
- period: Dönem (Örn: "Ocak 2025" veya "2025/1").
- referenceNumber: Tahakkuk fiş numarası, Barkod veya Sicil No.
- dueDate: Vade tarihi (Son ödeme günü).

Sadece JSON dizisi döndür.
`;
