
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';

// --- SERVICE & UTILS IMPORTS ---
// Bu dosyalar kök dizinde veya alt klasörlerde olduğu için ./ ile erişiyoruz
import { processZReportImage, processTaxDocument } from './services/geminiService';
import { exportToExcel, exportTaxSummaryToExcel } from './utils/excelExport';
import { ZReportData, TaxDocumentData, Company, VatDetail, RobotSettings } from './types';
import { DOC_TYPE } from './constants';
import { getPaymentPdfBytes, generatePaymentPdf, generateSummaryPdf, transliterate } from './utils/pdfExport';
import { PYTHON_SCRIPT_CONTENT, README_CONTENT, LOADER_SCRIPT_CONTENT } from './utils/courierTemplates';

// ============================================================================================
// BİLEŞEN: UploadSection (Daha önce App.tsx içindeydi, burada tutuyoruz)
// ============================================================================================
interface UploadSectionProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

const UploadSection: React.FC<UploadSectionProps> = ({ onFilesSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group
        ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-300' : 
          isDragging ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}
      `}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleInputChange}
        className="hidden"
        multiple
        accept="image/*,.pdf"
        disabled={disabled}
      />
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-blue-100' : 'bg-slate-100 group-hover:bg-blue-50'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 transition-colors ${isDragging ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
        </div>
        <div>
            <div className="text-slate-700 font-semibold text-lg">
            {disabled ? 'İşlem Sürüyor...' : 'Dosyaları Buraya Bırakın'}
            </div>
            <div className="text-slate-400 text-sm mt-1">
            Z-Raporu (Görsel) veya Tahakkuk Fişi (PDF)
            </div>
        </div>
        {!disabled && (
            <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm group-hover:shadow group-hover:border-blue-200 transition-all">
                veya dosya seçmek için tıklayın
            </span>
        )}
      </div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: ResultTable
// ============================================================================================
interface ResultTableProps {
  data: ZReportData[];
  onUpdateItem: (id: string, field: keyof ZReportData, value: any) => void;
  onEditDetails: (item: ZReportData) => void;
}

const getVatValues = (item: ZReportData, rate: number) => {
  if (!item.vatDetails || !Array.isArray(item.vatDetails)) {
      return { gross: 0, tax: 0 };
  }
  const detail = item.vatDetails.find(d => Math.abs((d.rate || 0) - rate) < 0.5);
  return {
    gross: detail ? (detail.grossAmount || 0) : 0,
    tax: detail ? (detail.taxAmount || 0) : 0
  };
};

const ResultTable: React.FC<ResultTableProps> = ({ data, onUpdateItem, onEditDetails }) => {
  if (!data || data.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-2">
        <div className="bg-slate-700 text-white text-xs px-2 py-1 rounded font-bold">Z Raporu İşlemleri</div>
        <span className="text-slate-500 text-xs">Veriler aşağıdaki formatta "Dosyadan Aktarım" için hazırlanacaktır.</span>
      </div>
      
      <div className="overflow-x-auto rounded-none border border-slate-300 shadow-sm bg-white pb-4">
        <table className="w-full text-xs text-left text-slate-700 border-collapse">
          <thead className="bg-slate-200 text-slate-800 font-semibold border-b-2 border-slate-300">
            <tr>
              <th className="p-2 border-r border-slate-300 w-8 text-center bg-slate-300 sticky left-0 z-20 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">#</th>
              <th className="p-2 border-r border-slate-300 min-w-[150px] sticky left-8 z-20 bg-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Firma / POS</th>
              <th className="p-2 border-r border-slate-300 min-w-[90px]">Belge Tarihi</th>
              <th className="p-2 border-r border-slate-300 w-16 text-center">Tür</th>
              <th className="p-2 border-r border-slate-300 min-w-[80px]">Belge No</th>
              <th className="p-2 border-r border-slate-300 text-right bg-blue-50/50 min-w-[100px]">%20 Matrah+KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-blue-50/50 min-w-[80px]">%20 KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-yellow-50/50 min-w-[100px]">%10 Matrah+KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-yellow-50/50 min-w-[80px]">%10 KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-red-50/50 min-w-[100px]">%1 Matrah+KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-red-50/50 min-w-[80px]">%1 KDV</th>
              <th className="p-2 border-r border-slate-300 text-right bg-gray-100 min-w-[100px]">%0 Matrah (KDV Yok)</th>
              <th className="p-2 border-r border-slate-300 text-right font-bold bg-green-50/50 min-w-[100px]">Nakit (KASA)</th>
              <th className="p-2 border-r border-slate-300 text-right font-bold bg-orange-50/50 min-w-[100px]">K. Kartı</th>
              <th className="p-2 text-center w-10">Dzn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, index) => {
              const vat20 = getVatValues(row, 20);
              const vat10 = getVatValues(row, 10);
              const vat1 = getVatValues(row, 1);
              const vat0 = getVatValues(row, 0); 
              const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50';
              const statusColor = row.status === 'error' ? 'bg-red-50' : rowBg;

              return (
                <tr key={row.id} className={`${statusColor} hover:bg-blue-50 transition-colors`}>
                  <td className={`p-1 border-r border-slate-200 text-center font-mono text-slate-400 sticky left-0 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] ${statusColor}`}>{index + 1}</td>
                  <td className={`p-0 border-r border-slate-200 relative group sticky left-8 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${statusColor}`}>
                       <input 
                          type="text" 
                          value={row.posName || ""} 
                          onChange={(e) => onUpdateItem(row.id, 'posName', e.target.value)}
                          className={`w-full h-full bg-transparent px-2 py-1.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${row.companyId ? 'text-blue-700' : 'text-slate-700'}`}
                      />
                      {row.companyId && <div className="absolute right-1 top-2 w-2 h-2 bg-blue-500 rounded-full" title="Firma Eşleşti"></div>}
                  </td>
                  <td className="p-0 border-r border-slate-200">
                      <input type="text" value={row.date || ""} onChange={(e) => onUpdateItem(row.id, 'date', e.target.value)} className="w-full h-full bg-transparent px-2 py-1.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" placeholder="GG.AA.YYYY" />
                  </td>
                  <td className="p-1 border-r border-slate-200 text-center text-slate-500 font-bold text-[10px] select-none">{DOC_TYPE}</td>
                  <td className="p-0 border-r border-slate-200">
                      <input type="text" value={row.zReportNo || ""} onChange={(e) => onUpdateItem(row.id, 'zReportNo', e.target.value)} className="w-full h-full bg-transparent px-2 py-1.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-600 bg-blue-50/20">{vat20.gross > 0 ? vat20.gross.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-500 text-[11px] bg-blue-50/20">{vat20.tax > 0 ? vat20.tax.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-600 bg-yellow-50/20">{vat10.gross > 0 ? vat10.gross.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-500 text-[11px] bg-yellow-50/20">{vat10.tax > 0 ? vat10.tax.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-600 bg-red-50/20">{vat1.gross > 0 ? vat1.gross.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-500 text-[11px] bg-red-50/20">{vat1.tax > 0 ? vat1.tax.toFixed(2) : '-'}</td>
                  <td className="p-1 border-r border-slate-200 text-right text-slate-600 bg-gray-100">{vat0.gross > 0 ? vat0.gross.toFixed(2) : '-'}</td>
                  <td className="p-0 border-r border-slate-200 bg-green-50/20">
                      <input type="number" step="0.01" value={row.cashAmount || 0} onChange={(e) => onUpdateItem(row.id, 'cashAmount', parseFloat(e.target.value))} className="w-full h-full bg-transparent px-2 py-1.5 text-right font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </td>
                  <td className="p-0 border-r border-slate-200 bg-orange-50/20">
                      <input type="number" step="0.01" value={row.creditCardAmount || 0} onChange={(e) => onUpdateItem(row.id, 'creditCardAmount', parseFloat(e.target.value))} className="w-full h-full bg-transparent px-2 py-1.5 text-right font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </td>
                  <td className="p-1 text-center">
                      <button onClick={() => onEditDetails(row)} className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100" title="Detaylı Düzenle">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                      </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-slate-400 text-right">* "Firma / POS" sütunu sola sabitlenmiştir.</div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: EditModal
// ============================================================================================
interface EditModalProps {
  item: ZReportData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: ZReportData) => void;
}

const EditModal: React.FC<EditModalProps> = ({ item, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState<ZReportData | null>(null);

  useEffect(() => {
    if (item) setFormData({ ...item });
  }, [item]);

  if (!isOpen || !formData) return null;

  const handleChange = (field: keyof ZReportData, value: any) => {
    setFormData(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleVatChange = (index: number, field: keyof VatDetail, value: number) => {
    if (!formData) return;
    const newVatDetails = [...formData.vatDetails];
    newVatDetails[index] = { ...newVatDetails[index], [field]: value };
    setFormData({ ...formData, vatDetails: newVatDetails });
  };

  const addVatRow = () => {
    if (!formData) return;
    setFormData({ ...formData, vatDetails: [...formData.vatDetails, { rate: 20, taxAmount: 0, grossAmount: 0 }] });
  };

  const removeVatRow = (index: number) => {
    if (!formData) return;
    const newVatDetails = formData.vatDetails.filter((_, i) => i !== index);
    setFormData({ ...formData, vatDetails: newVatDetails });
  };

  const handleSave = () => {
    if (formData) {
      const updatedItem = { ...formData, status: 'success' as const, errorMessage: undefined };
      onSave(updatedItem);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Z Raporu Düzenle: <span className="text-blue-600 font-bold">{formData.fileName}</span></h3>
            <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
              <div className="col-span-1 space-y-4">
                <div><label className="block text-sm font-medium text-gray-700">Tarih</label><input type="text" value={formData.date} onChange={(e) => handleChange('date', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700">Z No / Belge No</label><input type="text" value={formData.zReportNo} onChange={(e) => handleChange('zReportNo', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700">POS / Banka Adı</label><input type="text" value={formData.posName} onChange={(e) => handleChange('posName', e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
              </div>
              <div className="col-span-1 space-y-4">
                <div><label className="block text-sm font-medium text-gray-700">Toplam Satış (Brüt)</label><input type="number" step="0.01" value={formData.totalSales} onChange={(e) => handleChange('totalSales', parseFloat(e.target.value))} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700">Nakit (KASA)</label><input type="number" step="0.01" value={formData.cashAmount} onChange={(e) => handleChange('cashAmount', parseFloat(e.target.value))} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700">Kredi Kartı</label><input type="number" step="0.01" value={formData.creditCardAmount} onChange={(e) => handleChange('creditCardAmount', parseFloat(e.target.value))} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" /></div>
              </div>
              <div className="col-span-1 sm:col-span-2 mt-4">
                <div className="flex justify-between items-center mb-2"><label className="block text-sm font-medium text-gray-700">KDV Dağılımı</label><button onClick={addVatRow} type="button" className="text-xs text-blue-600 hover:text-blue-800 font-semibold">+ KDV Ekle</button></div>
                <div className="border rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Oran %</th><th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">KDV Tutar</th><th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">Brüt</th><th></th></tr></thead>
                        <tbody className="bg-white divide-y divide-gray-200">{formData.vatDetails.map((vat, idx) => (<tr key={idx}><td className="px-3 py-2"><input type="number" value={vat.rate} onChange={(e) => handleVatChange(idx, 'rate', parseFloat(e.target.value))} className="w-16 border-gray-300 rounded text-sm" /></td><td className="px-3 py-2"><input type="number" step="0.01" value={vat.taxAmount} onChange={(e) => handleVatChange(idx, 'taxAmount', parseFloat(e.target.value))} className="w-24 border-gray-300 rounded text-sm" /></td><td className="px-3 py-2"><input type="number" step="0.01" value={vat.grossAmount} onChange={(e) => handleVatChange(idx, 'grossAmount', parseFloat(e.target.value))} className="w-24 border-gray-300 rounded text-sm" /></td><td className="px-3 py-2 text-right"><button onClick={() => removeVatRow(idx)} className="text-red-500 font-bold">&times;</button></td></tr>))}</tbody>
                    </table>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse"><button onClick={handleSave} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 sm:ml-3 sm:w-auto sm:text-sm">Kaydet</button><button onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">İptal</button></div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: CompanyManagerModal
// ============================================================================================
interface CompanyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Company[];
  onSave: (companies: Company[]) => void;
}

const CompanyManagerModal: React.FC<CompanyManagerModalProps> = ({ isOpen, onClose, companies, onSave }) => {
  const [localCompanies, setLocalCompanies] = useState<Company[]>(companies);
  const [newCompany, setNewCompany] = useState<Partial<Company>>({ name: '', matchKeywords: '', email: '', phone: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => setLocalCompanies(companies), [companies]);
  if (!isOpen) return null;

  const resetForm = () => { setNewCompany({ name: '', matchKeywords: '', email: '', phone: '' }); setEditingId(null); };

  const handleAdd = () => {
    if (newCompany.name) {
      const company: Company = { id: crypto.randomUUID(), name: newCompany.name || "", matchKeywords: newCompany.matchKeywords || newCompany.name || "", email: newCompany.email || "", phone: newCompany.phone || "" };
      const updated = [...localCompanies, company];
      setLocalCompanies(updated); onSave(updated); resetForm();
    }
  };

  const handleUpdate = () => {
      if (newCompany.name && editingId) {
          const updated = localCompanies.map(c => c.id === editingId ? { ...c, name: newCompany.name!, matchKeywords: newCompany.matchKeywords!, email: newCompany.email, phone: newCompany.phone } : c);
          setLocalCompanies(updated); onSave(updated); resetForm();
      }
  };

  const startEditing = (company: Company) => {
      setNewCompany({ name: company.name, matchKeywords: company.matchKeywords, email: company.email || "", phone: company.phone || "" });
      setEditingId(company.id);
  };

  const handleDelete = (id: string) => {
    if (confirm("Silmek istediğinize emin misiniz?")) {
        const updated = localCompanies.filter(c => c.id !== id);
        setLocalCompanies(updated); onSave(updated);
        if (editingId === id) resetForm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true">
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-900 bg-opacity-75 transition-opacity" onClick={onClose}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="relative inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
                <div className="bg-white px-8 pt-6 pb-6">
                    <div className="flex justify-between items-center mb-6 border-b pb-4"><h3 className="text-xl font-bold text-slate-800">Firma Yönetimi</h3><button onClick={onClose}>&times;</button></div>
                    <div className={`p-5 rounded-xl border mb-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
                        <div className="flex justify-between items-center mb-3"><h4 className={`text-sm font-bold ${editingId ? 'text-amber-800' : 'text-blue-800'}`}>{editingId ? 'Düzenle' : 'Yeni Firma'}</h4>{editingId && <button onClick={resetForm} className="text-xs underline">İptal</button>}</div>
                        <div className="grid grid-cols-12 gap-3">
                            <input placeholder="Firma Adı" className="col-span-3 p-3 border rounded-lg text-sm" value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} />
                            <input placeholder="Anahtar Kelimeler" className="col-span-3 p-3 border rounded-lg text-sm" value={newCompany.matchKeywords} onChange={e => setNewCompany({...newCompany, matchKeywords: e.target.value})} />
                            <input placeholder="E-Posta" className="col-span-2 p-3 border rounded-lg text-sm" value={newCompany.email} onChange={e => setNewCompany({...newCompany, email: e.target.value})} />
                            <input placeholder="Tel (905...)" className="col-span-2 p-3 border rounded-lg text-sm" value={newCompany.phone} onChange={e => setNewCompany({...newCompany, phone: e.target.value})} />
                            {editingId ? <button onClick={handleUpdate} className="col-span-2 bg-amber-600 text-white rounded-lg font-bold text-xs">GÜNCELLE</button> : <button onClick={handleAdd} className="col-span-2 bg-blue-600 text-white rounded-lg font-bold text-sm">EKLE +</button>}
                        </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-xl shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Firma Adı</th><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Anahtar Kelimeler</th><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">İletişim</th><th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">İşlem</th></tr></thead>
                            <tbody className="bg-white divide-y divide-slate-200">{localCompanies.map(c => (<tr key={c.id} className={`hover:bg-slate-50 ${editingId === c.id ? 'bg-amber-50' : ''}`}><td className="px-6 py-4 text-sm font-semibold">{c.name}</td><td className="px-6 py-4 text-sm">{c.matchKeywords}</td><td className="px-6 py-4 text-xs">{c.email}<br/>{c.phone}</td><td className="px-6 py-4 text-right"><button onClick={() => startEditing(c)} className="text-blue-600 mr-2">Düzenle</button><button onClick={() => handleDelete(c.id)} className="text-red-600">Sil</button></td></tr>))}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: RobotConfigModal
// ============================================================================================
interface RobotConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (settings: RobotSettings) => void;
}

const RobotConfigModal: React.FC<RobotConfigModalProps> = ({ isOpen, onClose, onDownload }) => {
  const [settings, setSettings] = useState<RobotSettings>({ email: '', appPassword: '', whatsappEnabled: true, emailEnabled: true, sendingMode: 'all' });
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 transition-opacity" onClick={onClose}></div>
        <div className="relative inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-slate-800 px-6 py-4 flex justify-between items-center"><h3 className="text-lg font-bold text-white">🤖 Robot Kurulum</h3><button onClick={onClose} className="text-white">&times;</button></div>
          <div className="px-6 py-6 space-y-6">
            <div><label className="flex items-center"><input type="checkbox" checked={settings.whatsappEnabled} onChange={e => setSettings({...settings, whatsappEnabled: e.target.checked})} className="mr-2"/> WhatsApp</label></div>
            <div><label className="flex items-center"><input type="checkbox" checked={settings.emailEnabled} onChange={e => setSettings({...settings, emailEnabled: e.target.checked})} className="mr-2"/> E-Posta</label></div>
            {settings.emailEnabled && (
                <div className="bg-slate-50 p-3 rounded space-y-3">
                    <input type="email" placeholder="Gmail Adresi" className="w-full p-2 border rounded" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} />
                    <input type="text" placeholder="Uygulama Şifresi" className="w-full p-2 border rounded" value={settings.appPassword} onChange={e => setSettings({...settings, appPassword: e.target.value})} />
                </div>
            )}
          </div>
          <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-2"><button onClick={() => onDownload(settings)} className="bg-slate-800 text-white px-4 py-2 rounded-lg">İndir</button><button onClick={onClose} className="bg-white border px-4 py-2 rounded-lg">İptal</button></div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: InternalRobotGuide
// ============================================================================================
interface InternalRobotGuideProps { onClose: () => void; }
const InternalRobotGuide: React.FC<InternalRobotGuideProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('troubleshoot');
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 transition-opacity" onClick={onClose}></div>
        <div className="relative inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
            <div className="flex h-[600px]">
                <div className="w-1/3 bg-slate-50 border-r p-6">
                    <h3 className="font-bold text-lg mb-4">Robot Merkezi</h3>
                    <button onClick={() => setActiveTab('troubleshoot')} className={`w-full text-left px-4 py-3 rounded-xl mb-2 ${activeTab === 'troubleshoot' ? 'bg-green-100 text-green-800' : 'hover:bg-slate-200'}`}>Kurulum Rehberi</button>
                    <button onClick={() => setActiveTab('zreport')} className={`w-full text-left px-4 py-3 rounded-xl mb-2 ${activeTab === 'zreport' ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-200'}`}>Z-Raporu Robotu</button>
                </div>
                <div className="w-2/3 p-8 overflow-y-auto">
                    <div className="flex justify-between mb-4"><h2 className="text-2xl font-bold">Kurulum</h2><button onClick={onClose}>&times;</button></div>
                    <div className="space-y-4">
                        <p>1. Masaüstünde 'ROBOT' adında klasör açın.</p>
                        <p>2. İndirdiğiniz ZIP dosyasını buraya çıkarın.</p>
                        <p>3. 'baslat.py' dosyasına çift tıklayın.</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================================
// BİLEŞEN: TaxTable (TaxDashboard)
// ============================================================================================
interface TaxTableProps { data: TaxDocumentData[]; companies: Company[]; }
type ZipMode = 'pdf_only' | 'original_only' | 'both';
const TAX_COLUMN_CONFIG: Record<string, string> = { 'KDV1': 'KDV', 'KDV2': 'KDV 2', 'MUHSGK': 'MUHSGK', 'SGK': 'SGK Prim', 'KGV': 'Kurum Geçici', 'GGV': 'Gelir Geçici', 'KV': 'Kurumlar V.', 'GV': 'Gelir V.', 'KONAKLAMA': 'Konaklama', 'TURIZM': 'Turizm Payı', 'POSET': 'Poşet Beyanı', 'DAMGA': 'Damga V.', 'DIGER': 'Diğer' };
const ORDER_PRIORITY = ['KDV1', 'KDV2', 'MUHSGK', 'SGK', 'KGV', 'GGV', 'KV', 'GV', 'KONAKLAMA', 'TURIZM', 'POSET', 'DAMGA', 'DIGER'];

const TaxDashboard: React.FC<TaxTableProps> = ({ data, companies }) => {
  const [zipMode, setZipMode] = useState<ZipMode>('pdf_only');
  const [isGeneratingPdfs, setIsGeneratingPdfs] = useState(false);
  const [isRobotModalOpen, setIsRobotModalOpen] = useState(false);

  const { tableRows, activeColumns, columnTotals } = useMemo(() => {
    const map = new Map<string, any>();
    const foundTaxTypes = new Set<string>();
    companies.forEach(c => map.set(c.id, { id: c.id, displayName: c.name, isRegistered: true, taxData: {} }));
    data.forEach(item => {
        let entry;
        if (item.companyId && map.has(item.companyId)) entry = map.get(item.companyId);
        else {
            const normalizedName = item.companyName.trim().toLowerCase();
            const foundId = Array.from(map.keys()).find(id => map.get(id).displayName.toLowerCase() === normalizedName);
            if (foundId) entry = map.get(foundId);
            else {
                const tempId = `temp_${normalizedName}`;
                if (!map.has(tempId)) map.set(tempId, { id: tempId, displayName: item.companyName, isRegistered: false, taxData: {} });
                entry = map.get(tempId);
            }
        }
        if (entry) {
            const typeKey = item.taxType;
            foundTaxTypes.add(typeKey);
            if (!entry.taxData[typeKey]) entry.taxData[typeKey] = [];
            entry.taxData[typeKey].push({ amount: item.amount, file: item.originalFile, id: item.id });
        }
    });
    const activeCols = Array.from(foundTaxTypes).sort((a, b) => {
        const idxA = ORDER_PRIORITY.indexOf(a); const idxB = ORDER_PRIORITY.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1; if (idxB === -1) return -1;
        return idxA - idxB;
    });
    const rows = Array.from(map.values()).filter(row => row.isRegistered || Object.keys(row.taxData).length > 0);
    const totals: Record<string, number> = { general: 0 };
    activeCols.forEach(col => totals[col] = 0);
    rows.forEach(row => {
        let rowTotal = 0;
        Object.keys(row.taxData).forEach(key => {
            const sum = row.taxData[key].reduce((acc: number, curr: any) => acc + curr.amount, 0);
            rowTotal += sum; if (totals[key] !== undefined) totals[key] += sum;
        });
        row.rowTotal = rowTotal; totals.general += rowTotal;
    });
    return { tableRows: rows, activeColumns: activeCols, columnTotals: totals };
  }, [data, companies]);

  const handleDownloadFile = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file); const a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleGenerateAllPdfs = async () => {
    setIsGeneratingPdfs(true);
    try {
        const zip = new JSZip();
        if (companies.length > 0) zip.file("manifest.json", JSON.stringify(companies.map(c => ({ name: c.name, matchKeywords: c.matchKeywords, email: c.email || "", phone: c.phone || "" })), null, 2));
        for (const row of tableRows) {
            const companyItems = data.filter(d => (row.isRegistered && d.companyId === row.id) || d.companyName.toLowerCase() === row.displayName.toLowerCase());
            if (companyItems.length === 0) continue;
            const safeName = transliterate(row.displayName).replace(/[^a-zA-Z0-9_-]/g, "");
            if (zipMode === 'pdf_only' || zipMode === 'both') {
                const pdfBytes = await getPaymentPdfBytes(companyItems, row.displayName);
                if (pdfBytes) zip.file(`${safeName}_Odeme_Bildirimi.pdf`, pdfBytes);
            }
            if (zipMode === 'original_only' || zipMode === 'both') {
                for (const item of companyItems) {
                    if (item.originalFile) zip.file(`Belgeler/${safeName}/${transliterate(item.fileName)}`, await item.originalFile.arrayBuffer());
                }
            }
        }
        const content = await zip.generateAsync({ type: "blob" });
        const url = window.URL.createObjectURL(content); const link = document.createElement('a'); link.href = url; link.download = `Muhasebe_Paketi_${zipMode}.zip`; link.click();
    } catch (error) { console.error("Zip Hatası:", error); alert("Zip oluşturulurken bir hata oluştu."); } finally { setIsGeneratingPdfs(false); }
  };

  const handleDownloadRobotKit = async (settings: RobotSettings) => {
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(companies.map(c => ({ name: c.name, matchKeywords: c.matchKeywords, email: c.email || "", phone: c.phone || "" })), null, 2));
      zip.file("config.json", JSON.stringify(settings, null, 2));
      zip.file("data.lib", btoa(unescape(encodeURIComponent(PYTHON_SCRIPT_CONTENT))));
      zip.file("baslat.py", LOADER_SCRIPT_CONTENT);
      zip.file("OKU_BENI.txt", README_CONTENT);
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content); const link = document.createElement('a'); link.href = url; link.download = `Robot_Kurulum_Paketi.zip`; link.click(); setIsRobotModalOpen(false);
  };

  const renderCell = (cellDataArray: any[]) => {
      if (!cellDataArray || cellDataArray.length === 0) return <span className="text-slate-300 text-center block">-</span>;
      return (<div className="flex flex-col gap-1">{cellDataArray.map((item: any, idx: number) => (<div key={idx} className="flex items-center justify-between group bg-slate-50 hover:bg-white border border-transparent hover:border-blue-200 rounded px-2 py-1 transition-all"><span className="font-medium text-slate-700 text-[11px]">{item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>{item.file && (<button onClick={() => handleDownloadFile(item.file)} className="ml-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Orijinal Belgeyi İndir"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></button>)}</div>))}</div>);
  };

  if (data.length === 0 && companies.length === 0) return null;

  return (
    <div className="mt-8 animate-fadeIn">
      <RobotConfigModal isOpen={isRobotModalOpen} onClose={() => setIsRobotModalOpen(false)} onDownload={handleDownloadRobotKit} />
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
          <div className="flex justify-between items-center mb-6">
              <div><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><span>⚖️</span> Vergi & SGK Tahakkuk Merkezi</h2><p className="text-slate-500 text-sm mt-1">Yüklenen tahakkuk fişleri otomatik olarak türlerine göre ayrıştırılmıştır.</p></div>
              <div className="flex gap-2"><button onClick={async () => await generateSummaryPdf(data, companies)} className="text-xs font-bold text-slate-600 bg-slate-100 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-200">📊 Genel Liste (PDF)</button><button onClick={() => setIsRobotModalOpen(true)} className="text-xs font-bold text-green-700 bg-green-50 px-4 py-2 rounded-lg border border-green-200 hover:bg-green-100 flex items-center gap-1"><span>🤖</span> Robotu Kur</button></div>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex-1"><div className="text-sm font-bold text-slate-700 mb-2">Toplu İndirme Seçenekleri:</div><div className="flex gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="zipMode" checked={zipMode === 'pdf_only'} onChange={() => setZipMode('pdf_only')} className="text-blue-600 focus:ring-blue-500" /><span className="text-sm text-slate-600">Sadece Ödeme Bildirimleri (PDF)</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="zipMode" checked={zipMode === 'both'} onChange={() => setZipMode('both')} className="text-blue-600 focus:ring-blue-500" /><span className="text-sm text-slate-600">Her Şey (PDF + Orijinaller)</span></label></div></div>
              <button onClick={handleGenerateAllPdfs} disabled={isGeneratingPdfs} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex flex-col items-center">{isGeneratingPdfs ? 'Hazırlanıyor...' : (<><span>📦 Toplu ZIP İndir</span><span className="text-[10px] text-slate-300 font-normal">(Robot Liste Güncellemesi Dahil)</span></>)}</button>
          </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-300 shadow-xl bg-white pb-2">
        <table className="w-full text-xs text-left text-slate-700 min-w-[1000px]">
          <thead className="bg-slate-800 text-white font-bold uppercase text-[11px] leading-normal"><tr><th className="p-3 pl-4 sticky left-0 bg-slate-800 z-20 shadow-md min-w-[200px]">Firma Adı</th>{activeColumns.map(colKey => (<th key={colKey} className="p-3 text-right min-w-[100px] bg-slate-800/95 border-l border-slate-700">{TAX_COLUMN_CONFIG[colKey] || colKey}</th>))}<th className="p-3 text-right font-extrabold bg-blue-900 min-w-[110px]">TOPLAM</th><th className="p-3 text-center w-20">Özet</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{tableRows.length === 0 ? (<tr><td colSpan={activeColumns.length + 3} className="p-8 text-center text-slate-400">Görüntülenecek veri yok. Lütfen dosya yükleyin.</td></tr>) : (tableRows.map((row, i) => (<tr key={i} className="hover:bg-blue-50 group transition-colors"><td className="p-3 pl-4 font-semibold sticky left-0 bg-white group-hover:bg-blue-50 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] text-slate-800 border-r border-transparent"><div className="flex items-center gap-2">{row.displayName}{!row.isRegistered && (<span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded border border-amber-200">YENİ</span>)}</div></td>{activeColumns.map(colKey => (<td key={colKey} className="p-2 border-r border-slate-100 align-top">{renderCell(row.taxData[colKey])}</td>))}<td className="p-3 text-right font-bold text-slate-800 bg-blue-50/30 border-l border-blue-100 align-top">{row.rowTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td><td className="p-2 text-center align-top"><button onClick={async () => {const items = data.filter(d => (row.isRegistered && d.companyId === row.id) || d.companyName === row.displayName); await generatePaymentPdf(items, row.displayName);}} className="text-slate-400 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 rounded p-1.5 transition-all shadow-sm" title="Ödeme Bildirimi PDF İndir"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></button></td></tr>)))}</tbody>
          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800"><tr><td className="p-3 pl-4 sticky left-0 bg-slate-100 z-10 text-right">GENEL TOPLAM:</td>{activeColumns.map(colKey => (<td key={colKey} className="p-3 text-right">{(columnTotals[colKey] || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>))}<td className="p-3 text-right bg-blue-100 text-blue-900 border-l border-blue-200">{columnTotals.general.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td><td></td></tr></tfoot>
        </table>
      </div>
    </div>
  );
};

// ============================================================================================
// ANA UYGULAMA (App)
// ============================================================================================
function App() {
  const [activeMode, setActiveMode] = useState<'zreport' | 'tax'>('zreport');
  const [isTestMode, setIsTestMode] = useState(false);
  const [zItems, setZItems] = useState<ZReportData[]>([]);
  const [taxItems, setTaxItems] = useState<TaxDocumentData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRobotGuideOpen, setIsRobotGuideOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ZReportData | null>(null);

  const [companies, setCompanies] = useState<Company[]>(() => {
    try { const saved = localStorage.getItem('companies'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const handleSaveCompanies = (updatedCompanies: Company[]) => {
      setCompanies(updatedCompanies);
      localStorage.setItem('companies', JSON.stringify(updatedCompanies));
  };

  const handleFiles = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    let currentCompanies = [...companies];
    let companiesChanged = false;
    let newTaxItems: TaxDocumentData[] = [];
    let newZItems: ZReportData[] = [];

    try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            if (activeMode === 'zreport') {
              const results = await processZReportImage(file, isTestMode);
              newZItems.push(...results);
            } else {
              const results = await processTaxDocument(file, isTestMode);
              const enrichedResults = results.map(item => {
                  const normalize = (s: string) => s.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, "").toLowerCase();
                  let match = currentCompanies.find(c => normalize(c.name) === normalize(item.companyName) || normalize(item.companyName).includes(normalize(c.name)));
                  if (!match && item.companyName && item.companyName.length > 2 && item.companyName !== "Tanımsız Firma" && item.companyName !== "HATA") {
                      const firstWord = item.companyName.trim().split(/\s+/)[0]; 
                      const newCompany: Company = { id: crypto.randomUUID(), name: item.companyName, matchKeywords: firstWord, email: '', phone: '' };
                      currentCompanies.push(newCompany); match = newCompany; companiesChanged = true;
                  }
                  return { ...item, companyId: match ? match.id : undefined, companyName: match ? match.name : item.companyName };
              });
              newTaxItems.push(...enrichedResults);
            }
          } catch (err) { console.error("Dosya İşleme Hatası:", err); }
        }
        if (companiesChanged) { setCompanies(currentCompanies); localStorage.setItem('companies', JSON.stringify(currentCompanies)); }
        if (newZItems.length > 0) setZItems(prev => [...prev, ...newZItems]);
        if (newTaxItems.length > 0) setTaxItems(prev => [...prev, ...newTaxItems]);
    } finally { setIsProcessing(false); }
  }, [activeMode, isTestMode, companies]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3"><div className="bg-blue-600 text-white font-bold p-2 rounded-lg shadow-sm">M-AI</div><h1 className="text-xl font-bold text-slate-800 tracking-tight">MuhasebeAI <span className="text-blue-600 font-medium text-sm">Pro v2 (Turbo)</span></h1></div>
        <div className="flex gap-4">
          <button onClick={() => setIsTestMode(!isTestMode)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${isTestMode ? 'bg-amber-400 text-amber-900 shadow-md' : 'bg-slate-100 text-slate-500'}`}>{isTestMode ? '🧪 TEST AKTİF' : 'Test Modu'}</button>
          <button onClick={() => setIsCompanyModalOpen(true)} className="bg-white border border-slate-300 text-slate-700 px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2"><span>🏢</span> Firma Yönetimi {companies.length > 0 && <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{companies.length}</span>}</button>
          <button onClick={() => setIsRobotGuideOpen(true)} className="bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"><span>🤖</span> Robot Merkezi</button>
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
          <UploadSection onFilesSelected={handleFiles} disabled={isProcessing} />
          {isProcessing && <div className="mt-4 text-center text-blue-600 font-medium animate-pulse">Belgeler Analiz Ediliyor... Lütfen Bekleyiniz.</div>}
          {((activeMode === 'zreport' && zItems.length > 0) || (activeMode === 'tax' && taxItems.length > 0)) && (
            <div className="mt-8 flex justify-end gap-4">
              <button onClick={() => activeMode === 'zreport' ? setZItems([]) : setTaxItems([])} className="px-6 py-3 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50">Listeyi Boşalt</button>
              <button onClick={() => activeMode === 'zreport' ? exportToExcel(zItems) : exportTaxSummaryToExcel(taxItems, companies)} className="px-8 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transition-transform active:scale-95">Excel Olarak İndir</button>
            </div>
          )}
        </div>
        {activeMode === 'zreport' && zItems.length > 0 && (<ResultTable data={zItems} onUpdateItem={(id, f, v) => setZItems(p => p.map(i => i.id === id ? {...i, [f]:v} : i))} onEditDetails={setEditingItem} />)}
        {activeMode === 'tax' && <TaxDashboard data={taxItems} companies={companies} />}
      </main>
      {isCompanyModalOpen && <CompanyManagerModal isOpen={isCompanyModalOpen} onClose={() => setIsCompanyModalOpen(false)} companies={companies} onSave={handleSaveCompanies} />}
      {isRobotGuideOpen && <InternalRobotGuide onClose={() => setIsRobotGuideOpen(false)} />}
      {editingItem && <EditModal item={editingItem} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onSave={(u) => { setZItems(p => p.map(i => i.id === u.id ? u : i)); setEditingItem(null); }} />}
    </div>
  );
}

export default App;
