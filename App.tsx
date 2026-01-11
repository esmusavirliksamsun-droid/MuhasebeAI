
import React, { useState, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { ResultTable } from './components/ResultTable';
import { TaxTable } from './components/TaxTable';
import { EditModal } from './components/EditModal';
import { InternalRobotGuide } from './components/InternalRobotGuide';
import { CompanyManagerModal } from './components/CompanyManagerModal';
import { processZReportImage, processTaxDocument } from './services/geminiService';
import { exportToExcel, exportTaxSummaryToExcel } from './utils/excelExport';
import { ZReportData, TaxDocumentData, Company } from './types';

function App() {
  const [activeMode, setActiveMode] = useState<'zreport' | 'tax'>('zreport');
  const [isTestMode, setIsTestMode] = useState(false);
  const [zItems, setZItems] = useState<ZReportData[]>([]);
  const [taxItems, setTaxItems] = useState<TaxDocumentData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRobotGuideOpen, setIsRobotGuideOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ZReportData | null>(null);

  // Güvenli LocalStorage Erişimi
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const saved = localStorage.getItem('companies');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleSaveCompanies = (updatedCompanies: Company[]) => {
      setCompanies(updatedCompanies);
      localStorage.setItem('companies', JSON.stringify(updatedCompanies));
  };

  const handleFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    
    // İşlem sırasında anlık firma listesini takip etmek için kopya oluşturuyoruz
    let currentCompanies = [...companies];
    let companiesChanged = false;
    let newTaxItems: TaxDocumentData[] = [];
    let newZItems: ZReportData[] = [];

    try {
        // HIZLANDIRMA: Yapay bekleme süresi kaldırıldı.
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          try {
            if (activeMode === 'zreport') {
              const results = await processZReportImage(file, isTestMode);
              newZItems.push(...results);
            } else {
              // --- VERGİ / TAHAKKUK MODU ---
              const results = await processTaxDocument(file, isTestMode);
              
              // Gelen sonuçları işle ve yeni firma varsa OTOMATİK EKLE
              const enrichedResults = results.map(item => {
                  // 1. Firmayı mevcut listede ara (İsim benzerliği)
                  // Türkçe karakter duyarsız ve boşluksuz karşılaştırma
                  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, "").toLowerCase();
                  
                  let match = currentCompanies.find(c => 
                      normalize(c.name) === normalize(item.companyName) ||
                      normalize(item.companyName).includes(normalize(c.name)) // Kapsama kontrolü
                  );

                  // 2. Eğer firma yoksa ve geçerli bir isimse -> YENİ OLUŞTUR
                  if (!match && item.companyName && item.companyName.length > 2 && item.companyName !== "Tanımsız Firma" && item.companyName !== "HATA") {
                      // İLK KELİMEYİ ANAHTAR KELİME YAP
                      const firstWord = item.companyName.trim().split(/\s+/)[0]; 
                      
                      const newCompany: Company = {
                          id: crypto.randomUUID(),
                          name: item.companyName, // Tam OCR adı
                          matchKeywords: firstWord, // Otomatik atanan anahtar kelime
                          email: '',
                          phone: ''
                      };

                      currentCompanies.push(newCompany);
                      match = newCompany;
                      companiesChanged = true;
                  }

                  // 3. Veriyi firma ID'si ile eşleştir
                  return {
                      ...item,
                      companyId: match ? match.id : undefined,
                      companyName: match ? match.name : item.companyName // İsmi de standartlaştır
                  };
              });

              newTaxItems.push(...enrichedResults);
            }
          } catch (err) { 
              console.error("Dosya İşleme Hatası:", err); 
          }
        }

        // --- SONUÇLARI GÜNCELLE ---

        if (companiesChanged) {
            setCompanies(currentCompanies);
            localStorage.setItem('companies', JSON.stringify(currentCompanies));
        }

        if (newZItems.length > 0) setZItems(prev => [...prev, ...newZItems]);
        if (newTaxItems.length > 0) setTaxItems(prev => [...prev, ...newTaxItems]);

    } finally {
        setIsProcessing(false);
    }
  }, [activeMode, isTestMode, companies]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white font-bold p-2 rounded-lg shadow-sm">M-AI</div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">MuhasebeAI <span className="text-blue-600 font-medium text-sm">Pro v2 (Turbo)</span></h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsTestMode(!isTestMode)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isTestMode ? 'bg-amber-400 text-amber-900 shadow-md' : 'bg-slate-100 text-slate-500'}`}>
            {isTestMode ? '🧪 TEST AKTİF' : 'Test Modu'}
          </button>
          <button onClick={() => setIsCompanyModalOpen(true)} className="bg-white border border-slate-300 text-slate-700 px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2">
            <span>🏢</span> Firma Yönetimi
            {companies.length > 0 && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{companies.length}</span>}
          </button>
          <button onClick={() => setIsRobotGuideOpen(true)} className="bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2">
            <span>🤖</span> Robot Merkezi
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-10 px-4">
        <div className="flex justify-center mb-10">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
            <button onClick={() => setActiveMode('zreport')} className={`px-10 py-3 rounded-lg text-sm font-bold transition-all ${activeMode === 'zreport' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Z-Raporu İşleme</button>
            <button onClick={() => setActiveMode('tax')} className={`px-10 py-3 rounded-lg text-sm font-bold transition-all ${activeMode === 'tax' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>Vergi & SGK Robotu</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-xl border border-slate-200 animate-slideUp">
          <Dropzone onFilesSelected={handleFiles} disabled={isProcessing} />
          {isProcessing && <div className="mt-4 text-center text-blue-600 font-medium animate-pulse">Belgeler Analiz Ediliyor... Lütfen Bekleyiniz.</div>}
          
          {((activeMode === 'zreport' && zItems.length > 0) || (activeMode === 'tax' && taxItems.length > 0)) && (
            <div className="mt-8 flex justify-end gap-4">
              <button onClick={() => activeMode === 'zreport' ? setZItems([]) : setTaxItems([])} className="px-6 py-3 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50">Listeyi Boşalt</button>
              <button onClick={() => activeMode === 'zreport' ? exportToExcel(zItems) : exportTaxSummaryToExcel(taxItems, companies)} className="px-8 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transition-transform active:scale-95">Excel Olarak İndir</button>
            </div>
          )}
        </div>

        {activeMode === 'zreport' && zItems.length > 0 && (
          <ResultTable data={zItems} onUpdateItem={(id, f, v) => setZItems(p => p.map(i => i.id === id ? {...i, [f]:v} : i))} onEditDetails={setEditingItem} />
        )}
        
        {activeMode === 'tax' && <TaxTable data={taxItems} companies={companies} />}
      </main>

      {isCompanyModalOpen && <CompanyManagerModal isOpen={isCompanyModalOpen} onClose={() => setIsCompanyModalOpen(false)} companies={companies} onSave={handleSaveCompanies} />}
      {isRobotGuideOpen && <InternalRobotGuide onClose={() => setIsRobotGuideOpen(false)} />}
      {editingItem && <EditModal item={editingItem} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onSave={(u) => { setZItems(p => p.map(i => i.id === u.id ? u : i)); setEditingItem(null); }} />}
    </div>
  );
}

export default App;
