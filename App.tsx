
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import autoTable from 'jspdf-autotable';
import jsPDF from 'jspdf';

// ============================================================================================
// 1. PYTHON ROBOT KODLARI (GÖMÜLÜ)
// ============================================================================================

const LOADER_SCRIPT_CONTENT = `
import base64
import os
import sys
import time
import traceback

def log_crash(e):
    try:
        with open("HATA_RAPORU.txt", "w", encoding="utf-8") as f:
            f.write("MUHASEBE ROBOTU HATA RAPORU\\n")
            f.write("=============================\\n")
            f.write(str(e) + "\\n\\n")
            f.write(traceback.format_exc())
    except: pass

try:
    if not os.path.exists("data.lib"):
        with open("HATA_RAPORU.txt", "w") as f: f.write("data.lib eksik!")
        raise Exception("'data.lib' dosyasi eksik.")

    with open("data.lib", "r") as f:
        encoded_data = f.read()
    
    decoded_code = base64.b64decode(encoded_data).decode('utf-8')
    
    exec_globals = {
        "__file__": "baslat.py", 
        "__name__": "__main__",
        "__builtins__": __builtins__
    }
    
    exec(decoded_code, exec_globals)

except Exception as e:
    log_crash(e)
    print("HATA OLUSTU. Rapor dosyada.")
    try: input()
    except: pass
`;

const README_CONTENT = `MUHASEBE ROBOTU - NETLIFY EDITION (v2.0)

NASIL KULLANILIR?
1. İndirdiğiniz "Ödeme Bildirimleri" veya "Z-Raporu" ZIP dosyasını bu klasöre atın.
2. Robot otomatik algılar, WhatsApp ve Mail gönderimini yapar.
3. Ayarları değiştirmek için program arayüzündeki "Ayarlar" butonunu kullanın.
`;

const PYTHON_SCRIPT_CONTENT = `
# -*- coding: utf-8 -*-
import sys
import os
import time
import shutil
import smtplib
import json
import zipfile
import subprocess
import threading
import ctypes
from urllib.parse import quote
from email.message import EmailMessage

try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, messagebox
except ImportError as e:
    with open("HATA_LOG.txt", "w") as f: f.write(f"GUI Hatasi: {e}")
    sys.exit(1)

def hide_console():
    try:
        kernel32 = ctypes.WinDLL('kernel32')
        user32 = ctypes.WinDLL('user32')
        hWnd = kernel32.GetConsoleWindow()
        if hWnd: user32.ShowWindow(hWnd, 0)
    except: pass

def show_console():
    try:
        kernel32 = ctypes.WinDLL('kernel32')
        user32 = ctypes.WinDLL('user32')
        hWnd = kernel32.GetConsoleWindow()
        if hWnd: user32.ShowWindow(hWnd, 5)
    except: pass

hide_console()

if sys.platform.startswith('win'):
    try: os.system('chcp 65001')
    except: pass

WHATSAPP_AVAILABLE = False
try:
    import pyautogui
    pyautogui.FAILSAFE = False
    WHATSAPP_AVAILABLE = True 
except: pass

try: BASE_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError: BASE_DIR = os.getcwd()

if not BASE_DIR or BASE_DIR == '.': BASE_DIR = os.getcwd()

WATCH_FOLDER = BASE_DIR
SENT_FOLDER = os.path.join(BASE_DIR, "Gonderilenler")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
MANIFEST_FILE = os.path.join(BASE_DIR, "manifest.json")

def load_config():
    default_config = {"email": "", "appPassword": "", "whatsappEnabled": True, "emailEnabled": True}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for k, v in default_config.items():
                    if k not in data: data[k] = v
                return data
        except: pass
    return default_config

def save_config(new_config):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(new_config, f, indent=4)
        return True
    except: return False

CONFIG = load_config()

def normalize_text(text):
    if not text: return ""
    tr_map = {'ğ':'g','Ğ':'G','ü':'u','Ü':'U','ş':'s','Ş':'S','ı':'i','İ':'I','ö':'o','Ö':'O','ç':'c','Ç':'C'}
    for k,v in tr_map.items(): text = text.replace(k,v)
    return "".join([c for c in text.lower() if c.isalnum()])

def load_clients():
    clients = {}
    if os.path.exists(MANIFEST_FILE):
        try:
            with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for item in data:
                    name_key = normalize_text(item.get('name', ''))
                    if len(name_key) > 2: clients[name_key] = item
                    keywords = item.get('matchKeywords', '').split(',')
                    for k in keywords:
                        clean_k = normalize_text(k)
                        if len(clean_k) > 2: clients[clean_k] = item
            return clients
        except: pass
    return {}

def copy_to_clipboard(path):
    try:
        abs_path = os.path.abspath(path).replace("'", "''")
        cmd = f"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetFileDropList([System.Collections.Specialized.StringCollection]@('{abs_path}'))"
        subprocess.run(["powershell", "-Command", cmd], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except: return False

def send_whatsapp(phone, path, text):
    if not WHATSAPP_AVAILABLE: return False
    try:
        phone = ''.join(filter(str.isdigit, str(phone)))
        if len(phone) == 10: phone = "90" + phone
        elif len(phone) == 11 and phone.startswith("0"): phone = "9" + phone
        
        copy_success = copy_to_clipboard(path)
        url = f"whatsapp://send?phone={phone}&text={quote(text)}"
        try: os.startfile(url)
        except: 
            import webbrowser
            webbrowser.open(url)
        time.sleep(5)
        try:
            w, h = pyautogui.size()
            pyautogui.click(w/2, h/2)
            time.sleep(0.5)
            if copy_success:
                pyautogui.hotkey('ctrl', 'v')
                time.sleep(2)
                pyautogui.press('enter')
                time.sleep(1)
                return True
        except: return False
    except: return False

def send_email(to_email, subject, body, filepath=None):
    current_conf = load_config()
    c_mail = current_conf.get("email", "")
    c_pass = current_conf.get("appPassword", "")
    if not c_mail or not c_pass: return False, "Ayarlar eksik"
    try:
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = c_mail
        msg['To'] = to_email
        msg.set_content(body)
        if filepath:
            ctype = 'application/octet-stream'
            if filepath.endswith('.pdf'): ctype = 'application/pdf'
            maintype, subtype = ctype.split('/', 1)
            with open(filepath, 'rb') as f:
                msg.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(filepath))
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(c_mail, c_pass)
            smtp.send_message(msg)
        return True, "Gonderildi"
    except Exception as e: return False, str(e)

class ModernButton(tk.Frame):
    def __init__(self, parent, text, icon, color, command, width=200):
        super().__init__(parent, bg=color, cursor="hand2", height=50, width=width)
        self.pack_propagate(False)
        self.command = command
        self.lbl_icon = tk.Label(self, text=icon, bg=color, fg="white", font=("Segoe UI Emoji", 16))
        self.lbl_icon.pack(side="left", padx=(15, 5))
        self.lbl_text = tk.Label(self, text=text, bg=color, fg="white", font=("Segoe UI", 10, "bold"))
        self.lbl_text.pack(side="left")
        self.bind("<Button-1>", self.on_click)
        self.lbl_icon.bind("<Button-1>", self.on_click)
        self.lbl_text.bind("<Button-1>", self.on_click)

    def on_click(self, e):
        self.command()

class SettingsDialog:
    def __init__(self, parent):
        self.top = tk.Toplevel(parent)
        self.top.title("Ayarlar")
        self.top.geometry("500x500")
        self.top.configure(bg="#f1f5f9")
        current = load_config()
        tk.Label(self.top, text="İletişim Ayarları", font=("Segoe UI", 14, "bold"), bg="#f1f5f9", fg="#334155").pack(pady=15)
        f = tk.Frame(self.top, bg="white", padx=20, pady=20)
        f.pack(fill="x", padx=20)
        tk.Label(f, text="Gmail Adresi:", bg="white", font=("Segoe UI", 9)).pack(anchor="w")
        self.entry_email = tk.Entry(f, width=40, font=("Consolas", 10))
        self.entry_email.insert(0, current.get("email", ""))
        self.entry_email.pack(fill="x", pady=(2, 10))
        tk.Label(f, text="Uygulama Şifresi:", bg="white", font=("Segoe UI", 9)).pack(anchor="w")
        self.entry_pass = tk.Entry(f, width=40, show="*", font=("Consolas", 10))
        self.entry_pass.insert(0, current.get("appPassword", ""))
        self.entry_pass.pack(fill="x", pady=(2, 10))
        self.var_wa = tk.BooleanVar(value=current.get("whatsappEnabled", True))
        self.var_mail = tk.BooleanVar(value=current.get("emailEnabled", True))
        tk.Checkbutton(f, text="WhatsApp ile Gönder", variable=self.var_wa, bg="white").pack(anchor="w")
        tk.Checkbutton(f, text="E-Posta ile Gönder", variable=self.var_mail, bg="white").pack(anchor="w")
        tk.Button(f, text="TEST MAİLİ GÖNDER", bg="#f59e0b", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", pady=5, command=self.test_mail).pack(fill="x", pady=10)
        tk.Button(self.top, text="KAYDET", bg="#22c55e", fg="white", font=("Segoe UI", 10, "bold"), relief="flat", pady=8, command=self.save).pack(fill="x", padx=20, pady=10)
        tk.Button(self.top, text="Siyah Konsolu Göster/Gizle", bg="#cbd5e1", fg="#334155", font=("Segoe UI", 8), relief="flat", command=self.toggle_console).pack(pady=5)

    def toggle_console(self):
        show_console()
        messagebox.showinfo("Bilgi", "Konsol açıldı. Gizlemek için programı kapatıp açın.")

    def test_mail(self):
        temp = {"email": self.entry_email.get().strip(), "appPassword": self.entry_pass.get().strip(), "whatsappEnabled": self.var_wa.get(), "emailEnabled": self.var_mail.get()}
        save_config(temp)
        if not temp["email"]: return messagebox.showerror("Hata", "Mail giriniz.")
        suc, msg = send_email(temp["email"], "Robot Test", "Robot calisiyor.")
        if suc: messagebox.showinfo("Başarılı", "Test maili gönderildi!")
        else: messagebox.showerror("Hata", msg)

    def save(self):
        new_conf = {"email": self.entry_email.get().strip(), "appPassword": self.entry_pass.get().strip(), "whatsappEnabled": self.var_wa.get(), "emailEnabled": self.var_mail.get()}
        save_config(new_conf)
        global CONFIG
        CONFIG = new_conf
        self.top.destroy()

class MainApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Muhasebe Robotu v16")
        self.root.geometry("800x600")
        self.root.configure(bg="#f8fafc")
        header = tk.Frame(self.root, bg="#1e293b", height=80)
        header.pack(fill="x")
        tk.Label(header, text="MUHASEBE OTOMASYON", font=("Segoe UI", 16, "bold"), bg="#1e293b", fg="white").place(x=20, y=25)
        tk.Button(header, text="⚙️ AYARLAR", bg="#334155", fg="white", font=("Segoe UI", 9, "bold"), relief="flat", command=lambda: SettingsDialog(self.root)).place(x=680, y=25)
        main_frame = tk.Frame(self.root, bg="#f8fafc")
        main_frame.pack(fill="both", expand=True, padx=20, pady=20)
        self.status_var = tk.StringVar(value="HAZIR - Bekleniyor...")
        self.status_lbl = tk.Label(main_frame, textvariable=self.status_var, font=("Segoe UI", 11), bg="#e2e8f0", fg="#475569", padx=10, pady=5, width=60)
        self.status_lbl.pack(pady=(0, 20))
        btn_grid = tk.Frame(main_frame, bg="#f8fafc")
        btn_grid.pack()
        self.btn_all = ModernButton(btn_grid, "OTOMATİK (HEPSİ)", "🚀", "#3b82f6", lambda: self.start_thread("all"), width=220)
        self.btn_all.grid(row=0, column=0, padx=10)
        self.btn_receipt = ModernButton(btn_grid, "SADECE TAHAKKUK", "📄", "#64748b", lambda: self.start_thread("receipts_only"), width=220)
        self.btn_receipt.grid(row=0, column=1, padx=10)
        self.btn_summary = ModernButton(btn_grid, "SADECE ÖDEME", "💰", "#64748b", lambda: self.start_thread("summary_only"), width=220)
        self.btn_summary.grid(row=0, column=2, padx=10)
        tk.Button(main_frame, text="DURDUR", bg="#ef4444", fg="white", font=("Segoe UI", 8, "bold"), relief="flat", width=20, command=self.stop_thread).pack(pady=10)
        log_frame = tk.Frame(main_frame, bg="white", bd=1, relief="solid")
        log_frame.pack(fill="both", expand=True, pady=10)
        tk.Label(log_frame, text="İşlem Günlüğü", bg="#f1f5f9", font=("Segoe UI", 8, "bold"), anchor="w", padx=5).pack(fill="x")
        self.log_box = scrolledtext.ScrolledText(log_frame, height=10, font=("Consolas", 9), state='disabled', bg="white", fg="#333")
        self.log_box.pack(fill="both", expand=True, padx=5, pady=5)
        self.current_thread = None
        self.stop_flag = False
        sys.stdout = self
        sys.stderr = self
        if not os.path.exists(SENT_FOLDER): os.makedirs(SENT_FOLDER)
        self.root.mainloop()

    def write(self, txt):
        self.log_box.config(state='normal')
        self.log_box.insert(tk.END, txt)
        self.log_box.see(tk.END)
        self.log_box.config(state='disabled')
    def flush(self): pass

    def stop_thread(self):
        if self.current_thread and self.current_thread.is_alive():
            print("--- DURDURULUYOR... ---")
            self.stop_flag = True
            self.status_var.set("DURDURULDU")
            self.status_lbl.config(bg="#fee2e2", fg="#991b1b")

    def start_thread(self, mode):
        if self.current_thread and self.current_thread.is_alive():
            self.stop_flag = True
            self.root.after(1000, lambda: self._real_start(mode))
        else:
            self._real_start(mode)

    def _real_start(self, mode):
        self.stop_flag = False
        self.status_var.set(f"ÇALIŞIYOR: {mode.upper()}")
        self.status_lbl.config(bg="#dcfce7", fg="#166534")
        print(f"\\n>>> YENİ MOD BAŞLATILIYOR: {mode.upper()}")
        self.current_thread = threading.Thread(target=self.worker, args=(mode,), daemon=True)
        self.current_thread.start()

    def worker(self, mode):
        clients = load_clients()
        print("Müşteri listesi yüklendi.")
        while not self.stop_flag:
            try:
                for f in os.listdir(WATCH_FOLDER):
                    if self.stop_flag: break
                    if f.lower().endswith('.zip'):
                        print(f"ZIP Bulundu: {f}")
                        try:
                            with zipfile.ZipFile(f, 'r') as z: z.extractall(WATCH_FOLDER)
                            time.sleep(2)
                            os.remove(f)
                            clients = load_clients()
                        except Exception as e: print(f"ZIP Hatasi: {e}")
                files = sorted([f for f in os.listdir(WATCH_FOLDER) if f.lower().endswith(('.pdf','.jpg','.png'))])
                processed_any = False
                for f in files:
                    if self.stop_flag: break
                    if f.startswith('.') or "Gonderilenler" in f: continue
                    is_notif = "odeme" in f.lower() or "bildirim" in f.lower() or "ozet" in f.lower()
                    if mode == "receipts_only" and is_notif: continue
                    if mode == "summary_only" and not is_notif: continue
                    print(f">> İşleniyor: {f}")
                    clean_name = normalize_text(f)
                    matched = None
                    best_len = 0
                    for k,v in clients.items():
                        if k in clean_name and len(k) > best_len:
                            matched = v
                            best_len = len(k)
                    if matched:
                        print(f"   Firma: {matched['name']}")
                        f_path = os.path.join(WATCH_FOLDER, f)
                        wa = False
                        mail = False
                        if CONFIG.get("whatsappEnabled") and matched.get("phone"):
                            wa = send_whatsapp(matched["phone"], f_path, f"Sayın Yetkili, {matched['name']} belgeniz ektedir.")
                        if CONFIG.get("emailEnabled") and matched.get("email"):
                            suc, msg = send_email(matched["email"], f"Muhasebe Belgesi - {matched['name']}", "Belgeniz ektedir.", f_path)
                            if suc: mail = True
                            else: print(f"   Mail Hata: {msg}")
                        no_contact = (not matched.get("phone") and not matched.get("email"))
                        if wa or mail or no_contact:
                            try:
                                shutil.move(f_path, os.path.join(SENT_FOLDER, f))
                                print("   [OK] Arşivlendi.")
                            except: pass
                        processed_any = True
                    else: pass
                if not processed_any:
                    for _ in range(4):
                        if self.stop_flag: break
                        time.sleep(0.5)
            except Exception as e:
                print(f"Dongu Hatasi: {e}")
                time.sleep(1)
        print("--- THREAD SONLANDI ---")

if __name__ == "__main__":
    MainApp()
`;

// ============================================================================================
// 2. TİPLER (TYPES)
// ============================================================================================

export interface VatDetail {
  rate: number;
  taxAmount: number;
  grossAmount: number;
}

export interface Company {
  id: string;
  name: string;
  matchKeywords: string;
  email?: string;
  phone?: string;
}

export interface RobotSettings {
  email: string;
  appPassword: string;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  sendingMode: 'all' | 'summary_only' | 'receipts_only';
}

export interface ZReportData {
  id: string;
  fileName: string;
  date: string;
  zReportNo: string;
  posName: string;
  totalSales: number;
  cashAmount: number;
  creditCardAmount: number;
  vatDetails: VatDetail[];
  status: 'pending' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  companyId?: string;
}

export type TaxType = 'KDV1' | 'KDV2' | 'MUHSGK' | 'SGK' | 'GGV' | 'KGV' | 'KV' | 'GV' | 'KONAKLAMA' | 'TURIZM' | 'POSET' | 'DIGER';

export interface TaxDocumentData {
  id: string;
  fileName: string;
  companyName: string;
  taxType: TaxType;
  amount: number;
  period: string;
  referenceNumber: string;
  dueDate?: string;
  status: 'success' | 'error';
  companyId?: string;
  originalFile?: File;
}

// ============================================================================================
// 3. SABİTLER VE KONFIGURASYON
// ============================================================================================

const EXCEL_HEADERS = [
  "Belge Tarihi", "Belge Türü", "Belge No",
  "% 20 KDV'li\nKDV Dahil\nTutar\nAlacak", "% 20 KDV'li\nKDV\n (% 20)\nAlacak",
  "% 10 KDV'li\nKDV Dahil\nTutar\nAlacak", "% 10 KDV'li\nKDV\n (% 10)\nAlacak",
  "% 1 KDV'li\nKDV Dahil\nTutar\nAlacak", "% 1 KDV'li\nKDV\n (% 1)\nAlacak",
  "% 0 KDV'li\nKDV Dahil\nTutar\nAlacak",
  "KASA\n\nTutar\nBorç", "KREDİ KARTI\n\nTutar\nBorç", "CARİ\n\nTutar\nBorç"
];

const DOC_TYPE = "ZRP";

const SYSTEM_INSTRUCTION = `
Sen uzman bir muhasebe OCR asistanısın.
GÖREV: Görüntüdeki Z RAPORLARINI bul ve aşağıdaki KATI KURALLARA göre verilerini çıkar.
JSON formatında döndür.
`;

const TAX_SYSTEM_INSTRUCTION = `
Sen uzman bir Mali Müşavir ve Vergi Uzmanısın.
GÖREV: Görüntüdeki "Tahakkuk Fişi" veya "Vergi/SGK Alındısı" belgesini analiz et.
ÖNEMLİ: Belgede yazan FIRMA ADINI (companyName) mutlaka tam olarak, olduğu gibi çıkar.
Çıkarılacak Veriler (JSON):
- companyName: Firma tam ünvanı.
- taxType: Belge türünü belirle (KDV1, KDV2, MUHSGK, SGK, KGV, GGV, KV, GV, KONAKLAMA, TURIZM, POSET, DAMGA, DIGER).
- amount: Ödenecek Toplam Tutar.
- period: Dönem.
- referenceNumber: Tahakkuk fiş numarası.
- dueDate: Vade tarihi.
Sadece JSON dizisi döndür.
`;

// ============================================================================================
// 4. YARDIMCI FONKSİYONLAR
// ============================================================================================

const transliterate = (text: string): string => {
    if (!text) return "";
    let result = text;
    const map: Record<string, string> = {
        'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S',
        'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C', ' ': '_'
    };
    result = result.replace(/[ğĞüÜşŞıİöÖçÇ ]/g, (char) => map[char] || char);
    return result.replace(/[^a-zA-Z0-9_-]/g, "");
};

const arrayBufferToBinaryString = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return binary;
};

const loadTurkishFonts = async (doc: jsPDF) => {
    try {
        const fontUrlRegular = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
        const fontBytesRegular = await fetch(fontUrlRegular).then(res => res.arrayBuffer());
        const base64Regular = btoa(arrayBufferToBinaryString(fontBytesRegular));
        
        const fontUrlMedium = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf';
        const fontBytesMedium = await fetch(fontUrlMedium).then(res => res.arrayBuffer());
        const base64Medium = btoa(arrayBufferToBinaryString(fontBytesMedium));

        doc.addFileToVFS('Roboto-Regular.ttf', base64Regular);
        doc.addFileToVFS('Roboto-Medium.ttf', base64Medium);
        doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
        doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
        doc.setFont('Roboto');
        return true;
    } catch (e) {
        doc.setFont("helvetica");
        return false;
    }
};

const createEsMusavirlikPdf = async (taxItems: TaxDocumentData[], companyName: string): Promise<jsPDF | null> => {
    if (taxItems.length === 0) return null;
    const doc = new jsPDF();
    await loadTurkishFonts(doc);

    doc.setFillColor(30, 58, 138); doc.rect(0, 0, 210, 40, 'F');
    doc.setFont('Roboto', 'bold'); doc.setFontSize(22); doc.setTextColor(255, 255, 255);
    doc.text("ES MÜŞAVİRLİK DANIŞMANLIK", 105, 20, { align: "center" });
    doc.setFontSize(10); doc.setFont('Roboto', 'normal'); doc.setTextColor(200, 220, 255);
    doc.text("Mali Müşavirlik & Finansal Danışmanlık Hizmetleri", 105, 28, { align: "center" });

    const today = new Date().toLocaleDateString('tr-TR');
    doc.setTextColor(40, 40, 40); doc.setFontSize(14); doc.setFont('Roboto', 'bold');
    doc.text("VERGİ VE SGK ÖDEME BİLDİRİMİ", 105, 55, { align: "center" });

    doc.setFontSize(10); doc.setFont('Roboto', 'normal');
    doc.text(`Sayın Yetkili,`, 14, 70);
    doc.setFont('Roboto', 'bold'); doc.text(companyName, 14, 75);
    doc.setFont('Roboto', 'normal'); doc.text(`Düzenleme Tarihi: ${today}`, 196, 75, { align: "right" });

    const tableBody = taxItems.map(item => [
        item.taxType, item.period || "-", item.dueDate || "-", item.referenceNumber || "Belirtilmedi",
        item.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + " TL"
    ]);

    autoTable(doc, {
        startY: 95,
        head: [['ÖDEME TÜRÜ', 'DÖNEM', 'VADE', 'TAHAKKUK NO / SİCİL NO', 'TUTAR']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255, font: 'Roboto', fontStyle: 'bold', halign: 'center' },
        styles: { font: 'Roboto', fontSize: 9, cellPadding: 4 },
    });

    const totalAmount = taxItems.reduce((sum, item) => sum + item.amount, 0);
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFillColor(240, 248, 255); doc.roundedRect(120, finalY, 76, 25, 3, 3, 'FD');
    doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.setTextColor(80, 80, 80);
    doc.text("GENEL TOPLAM ÖDEME", 158, finalY + 8, { align: "center" });
    doc.setFontSize(14); doc.setTextColor(30, 58, 138);
    doc.text(totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + " TL", 158, finalY + 18, { align: "center" });

    return doc;
};

const getPaymentPdfBytes = async (taxItems: TaxDocumentData[], companyName: string): Promise<ArrayBuffer | null> => {
    const doc = await createEsMusavirlikPdf(taxItems, companyName);
    return doc ? doc.output('arraybuffer') : null;
};

const generatePaymentPdf = async (taxItems: TaxDocumentData[], companyName: string) => {
    const doc = await createEsMusavirlikPdf(taxItems, companyName);
    if (doc) doc.save(`Odeme_Bildirimi_${transliterate(companyName)}.pdf`);
};

const findVat = (details: VatDetail[], rate: number, type: 'tax' | 'gross'): number => {
  const detail = details.find(d => Math.abs(d.rate - rate) < 0.5); 
  if (!detail) return 0;
  return type === 'tax' ? detail.taxAmount : detail.grossAmount;
};

const exportToExcel = (data: ZReportData[]) => {
  const rows = data.map(item => {
    const row: any = {};
    row[EXCEL_HEADERS[0]] = item.date;
    row[EXCEL_HEADERS[1]] = DOC_TYPE;
    row[EXCEL_HEADERS[2]] = item.zReportNo;
    row[EXCEL_HEADERS[3]] = findVat(item.vatDetails, 20, 'gross');
    row[EXCEL_HEADERS[4]] = findVat(item.vatDetails, 20, 'tax');
    row[EXCEL_HEADERS[5]] = findVat(item.vatDetails, 10, 'gross');
    row[EXCEL_HEADERS[6]] = findVat(item.vatDetails, 10, 'tax');
    row[EXCEL_HEADERS[7]] = findVat(item.vatDetails, 1, 'gross');
    row[EXCEL_HEADERS[8]] = findVat(item.vatDetails, 1, 'tax');
    row[EXCEL_HEADERS[9]] = findVat(item.vatDetails, 0, 'gross');
    row[EXCEL_HEADERS[10]] = item.cashAmount;
    row[EXCEL_HEADERS[11]] = item.creditCardAmount;
    row[EXCEL_HEADERS[12]] = 0;
    return row;
  });
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Z Raporlari");
  XLSX.writeFile(workbook, `ZRaporu_Export.xlsx`);
};

const TAX_LABELS: Record<string, string> = {
    'KDV1': 'KDV', 'KDV2': 'KDV 2', 'MUHSGK': 'MUHSGK', 'SGK': 'SGK Prim',
    'KGV': 'Kurum Geçici', 'GGV': 'Gelir Geçici', 'KV': 'Kurumlar V.', 'GV': 'Gelir V.',
    'KONAKLAMA': 'Konaklama', 'TURIZM': 'Turizm Payı', 'POSET': 'Poşet Beyanı', 'DAMGA': 'Damga V.', 'DIGER': 'Diğer'
};
const ORDER_PRIORITY = ['KDV1', 'KDV2', 'MUHSGK', 'SGK', 'KGV', 'GGV', 'KV', 'GV', 'KONAKLAMA', 'TURIZM', 'POSET', 'DAMGA', 'DIGER'];

const exportTaxSummaryToExcel = (taxItems: TaxDocumentData[], companies: Company[]) => {
    const summaryMap = new Map<string, any>();
    companies.forEach(c => summaryMap.set(c.id, { name: c.name, total: 0, taxes: {} }));
    taxItems.forEach(item => {
        let key = item.companyId || item.companyName;
        if (!summaryMap.has(key)) summaryMap.set(key, { name: item.companyName, total: 0, taxes: {} });
        const entry = summaryMap.get(key);
        if (entry) {
            entry.taxes[item.taxType] = (entry.taxes[item.taxType] || 0) + item.amount;
            entry.total += item.amount;
        }
    });

    const activeCols = ORDER_PRIORITY.filter(type => taxItems.some(i => i.taxType === type));
    const rows = Array.from(summaryMap.values()).map(entry => {
        const rowData: any = { "Firma Adı": entry.name };
        activeCols.forEach(col => rowData[TAX_LABELS[col] || col] = entry.taxes[col] || "VERİLMEDİ");
        rowData["Toplam Ödenecek"] = entry.total;
        return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tahakkuk Ozeti");
    XLSX.writeFile(workbook, `Genel_Vergi_Ozeti.xlsx`);
};

// ============================================================================================
// 5. GEMINI API ENTEGRASYONU
// ============================================================================================

const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToPart = async (file: File) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result) {
          const base64Data = (reader.result as string).split(',')[1];
          resolve({ inlineData: { data: base64Data, mimeType: file.type } });
      } else reject(new Error("Dosya okunamadı."));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const cleanAndParseJSON = (text: string) => {
    try {
        let cleanText = text.replace(/```json|```/g, '').trim();
        const firstBracket = cleanText.indexOf('[');
        const lastBracket = cleanText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) cleanText = cleanText.substring(firstBracket, lastBracket + 1);
        return JSON.parse(cleanText);
    } catch (e) { return []; }
};

const safeParseFloat = (value: any): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    let str = String(value).replace(/[^0-9.,-]/g, '');
    if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.includes(',')) str = str.replace(',', '.');
    return parseFloat(str) || 0;
};

const processZReportImage = async (file: File, isTest: boolean): Promise<ZReportData[]> => {
  if (isTest) return [{ id: crypto.randomUUID(), fileName: file.name, date: "01.01.2025", zReportNo: "TEST", posName: "TEST POS", totalSales: 100, cashAmount: 50, creditCardAmount: 50, vatDetails: [], status: 'success' }];
  
  try {
      const part = await fileToPart(file);
      const ai = getAIClient();
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: [{ parts: [part as any, { text: SYSTEM_INSTRUCTION }] }] });
      const rawData = cleanAndParseJSON(response.text || "[]");
      const dataArray = Array.isArray(rawData) ? rawData : [rawData];

      return dataArray.map(item => ({
        id: crypto.randomUUID(), fileName: file.name, date: item.date || "-", zReportNo: item.zReportNo || "-",
        posName: item.posName || "Bilinmiyor", totalSales: safeParseFloat(item.totalSales),
        cashAmount: safeParseFloat(item.cashAmount), creditCardAmount: safeParseFloat(item.creditCardAmount),
        vatDetails: (item.vatDetails || []).map((v:any) => ({ rate: safeParseFloat(v.rate), taxAmount: safeParseFloat(v.taxAmount), grossAmount: safeParseFloat(v.grossAmount) })),
        status: 'success'
      }));
  } catch (e) {
    return [{ id: crypto.randomUUID(), fileName: file.name, date: "-", zReportNo: "HATA", posName: "HATA", totalSales: 0, cashAmount: 0, creditCardAmount: 0, vatDetails: [], status: 'error' }];
  }
};

const processTaxDocument = async (file: File, isTest: boolean): Promise<TaxDocumentData[]> => {
    if (isTest) return [{ id: crypto.randomUUID(), fileName: file.name, companyName: "TEST LTD", taxType: "KDV1", amount: 1000, period: "01/2025", referenceNumber: "123", status: 'success', originalFile: file }];
    try {
        const part = await fileToPart(file);
        const ai = getAIClient();
        const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: [{ parts: [part as any, { text: TAX_SYSTEM_INSTRUCTION }] }] });
        const rawData = cleanAndParseJSON(response.text || "[]");
        const dataArray = Array.isArray(rawData) ? rawData : [rawData];

        return dataArray.map(item => ({
            id: crypto.randomUUID(), fileName: file.name, companyName: item.companyName || "Tanımsız",
            taxType: item.taxType || "DIGER", amount: safeParseFloat(item.amount),
            period: item.period || "-", referenceNumber: item.referenceNumber || "-",
            dueDate: item.dueDate, status: 'success', originalFile: file
        }));
    } catch {
        return [{ id: crypto.randomUUID(), fileName: file.name, companyName: "HATA", taxType: "DIGER", amount: 0, period: "-", referenceNumber: "-", status: 'error', originalFile: file }];
    }
};

// ============================================================================================
// 6. UI BİLEŞENLERİ
// ============================================================================================

interface UploadSectionProps { onFilesSelected: (files: File[]) => void; disabled: boolean; }
const UploadSection: React.FC<UploadSectionProps> = ({ onFilesSelected, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); if(!disabled && e.dataTransfer.files) onFilesSelected(Array.from(e.dataTransfer.files)); };
  return (
    <div onClick={() => !disabled && inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${disabled ? 'opacity-50' : 'hover:border-blue-400 hover:bg-slate-50'}`}>
      <input type="file" ref={inputRef} onChange={e => e.target.files && onFilesSelected(Array.from(e.target.files))} className="hidden" multiple accept="image/*,.pdf" disabled={disabled} />
      <div className="text-slate-700 font-semibold text-lg">{disabled ? 'İşlem Sürüyor...' : 'Dosyaları Buraya Bırakın'}</div>
    </div>
  );
};

interface ResultTableProps { data: ZReportData[]; onUpdateItem: (id: string, f: keyof ZReportData, v: any) => void; onEditDetails: (item: ZReportData) => void; }
const ResultTable: React.FC<ResultTableProps> = ({ data, onUpdateItem, onEditDetails }) => {
  return (
    <div className="mt-8 overflow-x-auto bg-white rounded shadow border pb-4">
      <table className="w-full text-xs text-left">
        <thead className="bg-slate-200 font-semibold"><tr><th className="p-2">#</th><th className="p-2">Firma/POS</th><th className="p-2">Tarih</th><th className="p-2">No</th><th className="p-2 text-right">Tutar</th><th className="p-2 text-right">Kasa</th><th className="p-2 text-right">K.Kartı</th><th className="p-2"></th></tr></thead>
        <tbody>
            {data.map((row, i) => (
                <tr key={row.id} className="border-b hover:bg-slate-50">
                    <td className="p-2">{i+1}</td>
                    <td className="p-2"><input value={row.posName} onChange={e=>onUpdateItem(row.id,'posName',e.target.value)} className="w-full bg-transparent"/></td>
                    <td className="p-2"><input value={row.date} onChange={e=>onUpdateItem(row.id,'date',e.target.value)} className="w-full bg-transparent"/></td>
                    <td className="p-2"><input value={row.zReportNo} onChange={e=>onUpdateItem(row.id,'zReportNo',e.target.value)} className="w-full bg-transparent"/></td>
                    <td className="p-2 text-right font-bold text-blue-600">{row.totalSales}</td>
                    <td className="p-2 text-right bg-green-50"><input type="number" value={row.cashAmount} onChange={e=>onUpdateItem(row.id,'cashAmount',parseFloat(e.target.value))} className="w-full text-right bg-transparent"/></td>
                    <td className="p-2 text-right bg-orange-50"><input type="number" value={row.creditCardAmount} onChange={e=>onUpdateItem(row.id,'creditCardAmount',parseFloat(e.target.value))} className="w-full text-right bg-transparent"/></td>
                    <td className="p-2 text-center"><button onClick={()=>onEditDetails(row)}>✏️</button></td>
                </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

// --- GELİŞMİŞ FİRMA YÖNETİMİ MODALI ---
interface CompanyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Company[];
  onSave: (companies: Company[]) => void;
  initialEditId?: string | null;
}

const CompanyManagerModal: React.FC<CompanyManagerModalProps> = ({ isOpen, onClose, companies, onSave, initialEditId }) => {
  const [localCompanies, setLocalCompanies] = useState<Company[]>(companies);
  const [newCompany, setNewCompany] = useState<Partial<Company>>({ name: '', matchKeywords: '', email: '', phone: '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
      setLocalCompanies(companies);
      if (initialEditId) {
          const found = companies.find(c => c.id === initialEditId);
          if (found) startEditing(found);
      }
  }, [companies, initialEditId]);

  if (!isOpen) return null;

  const resetForm = () => { setNewCompany({ name: '', matchKeywords: '', email: '', phone: '' }); setEditingId(null); };

  const handleAdd = () => {
    if (newCompany.name) {
      const company: Company = { 
          id: crypto.randomUUID(), 
          name: newCompany.name || "", 
          matchKeywords: newCompany.matchKeywords || newCompany.name || "", 
          email: newCompany.email || "", 
          phone: newCompany.phone || "" 
      };
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
                    <div className="flex justify-between items-center mb-6 border-b pb-4"><h3 className="text-xl font-bold text-slate-800">Firma Yönetimi</h3><button onClick={onClose} className="text-2xl text-slate-400 hover:text-red-500">&times;</button></div>
                    
                    <div className={`p-5 rounded-xl border mb-6 transition-colors ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-100'}`}>
                        <div className="flex justify-between items-center mb-3"><h4 className={`text-sm font-bold ${editingId ? 'text-amber-800' : 'text-blue-800'}`}>{editingId ? 'Mevcut Firmayı Düzenle' : 'Yeni Firma Ekle'}</h4>{editingId && <button onClick={resetForm} className="text-xs underline text-amber-700">İptal</button>}</div>
                        <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Firma Adı</label>
                                <input className="w-full p-2 border rounded-lg text-sm" value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} placeholder="Örn: ABC İnşaat" />
                            </div>
                            <div className="col-span-3">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Eşleşme Kelimesi</label>
                                <input className="w-full p-2 border rounded-lg text-sm" value={newCompany.matchKeywords} onChange={e => setNewCompany({...newCompany, matchKeywords: e.target.value})} placeholder="Örn: ABC" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">E-Posta</label>
                                <input className="w-full p-2 border rounded-lg text-sm" value={newCompany.email} onChange={e => setNewCompany({...newCompany, email: e.target.value})} placeholder="mail@site.com" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Telefon (905...)</label>
                                <input className="w-full p-2 border rounded-lg text-sm" value={newCompany.phone} onChange={e => setNewCompany({...newCompany, phone: e.target.value})} placeholder="905xxxxxxxxx" />
                            </div>
                            <div className="col-span-2 flex items-end">
                                {editingId ? 
                                    <button onClick={handleUpdate} className="w-full bg-amber-600 hover:bg-amber-700 text-white p-2 rounded-lg font-bold text-sm transition-colors">GÜNCELLE</button> : 
                                    <button onClick={handleAdd} className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg font-bold text-sm transition-colors">EKLE +</button>
                                }
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-xl shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0"><tr><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Firma Adı</th><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Anahtar Kelimeler</th><th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">İletişim</th><th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">İşlem</th></tr></thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {localCompanies.map(c => (
                                    <tr key={c.id} className={`hover:bg-slate-50 ${editingId === c.id ? 'bg-amber-50' : ''}`}>
                                        <td className="px-6 py-4 text-sm font-semibold text-slate-800">{c.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{c.matchKeywords}</td>
                                        <td className="px-6 py-4 text-xs text-slate-500">
                                            {c.email && <div className="flex items-center gap-1">✉️ {c.email}</div>}
                                            {c.phone && <div className="flex items-center gap-1">📱 {c.phone}</div>}
                                            {!c.email && !c.phone && <span className="text-slate-300">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => startEditing(c)} className="text-blue-600 hover:text-blue-800 mr-3 font-medium text-xs">Düzenle</button>
                                            <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800 font-medium text-xs">Sil</button>
                                        </td>
                                    </tr>
                                ))}
                                {localCompanies.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">Henüz firma eklenmemiş.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

// --- ROBOT KURULUM MODALI (YENİ EKLENDİ - EN ÜSTTE İNDİRME BUTONU) ---
interface RobotConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (settings: RobotSettings) => void;
}

const RobotConfigModal: React.FC<RobotConfigModalProps> = ({ isOpen, onClose, onDownload }) => {
  const [settings, setSettings] = useState<RobotSettings>({
    email: '',
    appPassword: '',
    whatsappEnabled: true,
    emailEnabled: true,
    sendingMode: 'all'
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900 bg-opacity-90 transition-opacity" onClick={onClose}></div>
        <div className="relative inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border-4 border-slate-800">
          <div className="bg-slate-800 px-6 py-4 flex justify-between items-center"><h3 className="text-lg font-bold text-white">🤖 Robot Kurulum & İndirme</h3><button onClick={onClose} className="text-white text-2xl hover:text-gray-300">&times;</button></div>
          <div className="px-6 py-6 space-y-6">
            
            {/* EN ÜSTTE BÜYÜK İNDİRME BUTONU - GÖZDEN KAÇIRILAMAZ */}
            <div className="bg-green-50 p-4 rounded-xl border-2 border-green-500 text-center">
                <p className="text-green-800 font-bold mb-2">Ayarları yapmadan da indirebilirsiniz:</p>
                <button onClick={() => onDownload(settings)} className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-4 rounded-xl font-bold shadow-xl transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-3">
                    <span className="text-2xl">📥</span> HEMEN İNDİR (.ZIP)
                </button>
            </div>

            <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center">
                    <span className="bg-white px-2 text-sm text-gray-500">veya ayarları özelleştirin</span>
                </div>
            </div>
            
            <div className="space-y-3">
                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={settings.whatsappEnabled} onChange={e => setSettings({...settings, whatsappEnabled: e.target.checked})} className="h-5 w-5 text-green-600 rounded focus:ring-green-500"/>
                    <span className="font-bold text-slate-700">WhatsApp Gönderimi Aktif</span>
                </label>
                <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={settings.emailEnabled} onChange={e => setSettings({...settings, emailEnabled: e.target.checked})} className="h-5 w-5 text-blue-600 rounded focus:ring-blue-500"/>
                    <span className="font-bold text-slate-700">E-Posta Gönderimi Aktif</span>
                </label>
            </div>

            {settings.emailEnabled && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                    <h4 className="text-sm font-bold text-slate-800 border-b pb-2">Gmail Ayarları (Zorunlu Değil)</h4>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Gmail Adresiniz</label>
                        <input type="email" placeholder="ornek@gmail.com" className="w-full p-2 border rounded-lg text-sm" value={settings.email} onChange={e => setSettings({...settings, email: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Uygulama Şifresi (App Password)</label>
                        <input type="text" placeholder="xxxx xxxx xxxx xxxx" className="w-full p-2 border rounded-lg text-sm font-mono" value={settings.appPassword} onChange={e => setSettings({...settings, appPassword: e.target.value})} />
                        <p className="text-[10px] text-slate-400 mt-1">* Google Hesabım &rarr; Güvenlik &rarr; 2 Adımlı Doğrulama &rarr; Uygulama Şifreleri</p>
                    </div>
                </div>
            )}
          </div>
          <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
            <button onClick={onClose} className="bg-white border hover:bg-gray-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-sm">Kapat</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- İÇ REHBER MODALI (YENİ EKLENDİ) ---
interface InternalRobotGuideProps { onClose: () => void; }
const InternalRobotGuide: React.FC<InternalRobotGuideProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-900 bg-opacity-80 transition-opacity" onClick={onClose}></div>
        <div className="relative inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
            <div className="bg-white p-8">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-2xl font-bold text-slate-800">Robot Kurulum Rehberi</h2>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-red-500">&times;</button>
                </div>
                <div className="space-y-6 text-slate-700">
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">1</div>
                        <div><h4 className="font-bold">İndirme</h4><p className="text-sm">"Robotu İndir" butonuna tıklayarak ZIP dosyasını bilgisayarınıza indirin.</p></div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">2</div>
                        <div><h4 className="font-bold">Klasöre Çıkarma</h4><p className="text-sm">Masaüstünde "ROBOT" adında yeni bir klasör açın ve indirdiğiniz ZIP dosyasının içindekileri bu klasöre çıkarın.</p></div>
                    </div>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">3</div>
                        <div><h4 className="font-bold">Çalıştırma</h4><p className="text-sm">Klasör içindeki <b>baslat.py</b> (veya sadece baslat) dosyasına çift tıklayın.</p></div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 text-sm text-amber-800">
                        <strong>Önemli Not:</strong> Bilgisayarınızda Python yüklü olmalıdır. Eğer yüklü değilse, Microsoft Store'dan veya python.org adresinden indirebilirsiniz.
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

interface TaxTableProps { data: TaxDocumentData[]; companies: Company[]; onEditCompany: (companyId: string) => void; }
const TaxDashboard: React.FC<TaxTableProps> = ({ data, companies, onEditCompany }) => {
    const { tableRows, activeColumns, columnTotals } = useMemo(() => {
        const map = new Map();
        const cols = new Set<string>();
        companies.forEach(c => map.set(c.id, { id: c.id, name: c.name, taxes: {}, total: 0, isRegistered: true }));
        data.forEach(d => {
            let key = d.companyId;
            let isReg = true;
            if(!key) {
                const found = companies.find(c => c.name.toLowerCase().includes(d.companyName.toLowerCase()));
                key = found ? found.id : d.companyName;
                if(!found) isReg = false;
            }
            if(!map.has(key)) map.set(key, { id: key, name: d.companyName, taxes: {}, total: 0, isRegistered: isReg });
            const entry = map.get(key);
            cols.add(d.taxType);
            if(!entry.taxes[d.taxType]) entry.taxes[d.taxType] = [];
            entry.taxes[d.taxType].push(d);
            entry.total += d.amount;
        });
        
        const sortedCols = Array.from(cols).sort((a, b) => ORDER_PRIORITY.indexOf(a) - ORDER_PRIORITY.indexOf(b));
        const totals: Record<string, number> = { general: 0 };
        sortedCols.forEach(c => totals[c] = 0);
        
        const rows = Array.from(map.values());
        rows.forEach(r => {
            totals.general += r.total;
            Object.keys(r.taxes).forEach(k => {
                const sum = r.taxes[k].reduce((a:number, b:any) => a + b.amount, 0);
                totals[k] += sum;
            });
        });
        
        return { tableRows: rows, activeColumns: sortedCols, columnTotals: totals };
    }, [data, companies]);

    const handleDownloadAll = async () => {
        const zip = new JSZip();
        for(const row of tableRows) {
            const items = data.filter(d => (d.companyId === row.id) || d.companyName === row.name);
            if(items.length === 0) continue;
            const pdf = await getPaymentPdfBytes(items, row.name);
            if(pdf) zip.file(`${transliterate(row.name)}_Odeme.pdf`, pdf);
        }
        const content = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a"); a.href = URL.createObjectURL(content); a.download="Odemeler.zip"; a.click();
    };

    return (
        <div className="mt-8 bg-white p-4 rounded shadow overflow-x-auto">
            <div className="flex justify-between mb-4">
                <h2 className="font-bold">Vergi Tahakkuk Tablosu</h2>
                <button onClick={handleDownloadAll} className="bg-slate-800 text-white px-4 py-2 rounded text-xs">📦 Toplu PDF İndir</button>
            </div>
            <table className="w-full text-xs">
                <thead className="bg-slate-800 text-white">
                    <tr>
                        <th className="p-2">Firma</th>
                        {activeColumns.map(c => <th key={c} className="p-2 text-right">{TAX_LABELS[c]||c}</th>)}
                        <th className="p-2 text-right bg-blue-900">TOPLAM</th>
                        <th className="p-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {tableRows.map((row, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50 group">
                            <td className="p-2 font-bold text-slate-800">
                                <div className="flex items-center gap-2">
                                    {row.name}
                                    {row.isRegistered && (
                                        <button onClick={() => onEditCompany(row.id)} className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" title="İletişim Bilgilerini Düzenle">
                                            ✏️
                                        </button>
                                    )}
                                    {!row.isRegistered && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded">YENİ</span>}
                                </div>
                            </td>
                            {activeColumns.map(c => {
                                const items = row.taxes[c];
                                if(!items) return <td key={c} className="p-2 text-right text-slate-300">-</td>;
                                return <td key={c} className="p-2 text-right">{items.reduce((a:number,b:any)=>a+b.amount,0).toLocaleString('tr-TR')}</td>
                            })}
                            <td className="p-2 text-right font-bold">{row.total.toLocaleString('tr-TR')}</td>
                            <td className="p-2"><button onClick={async ()=>{const items=data.filter(d=>(d.companyId===row.id)||d.companyName===row.name); await generatePaymentPdf(items, row.name)}} className="text-blue-600">PDF</button></td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold">
                    <tr>
                        <td className="p-2 text-right">GENEL TOPLAM:</td>
                        {activeColumns.map(c => <td key={c} className="p-2 text-right">{columnTotals[c].toLocaleString('tr-TR')}</td>)}
                        <td className="p-2 text-right text-blue-800">{columnTotals.general.toLocaleString('tr-TR')}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

// Basit Z-Raporu Düzenleme Modalı
const EditModal: React.FC<any> = ({item, isOpen, onClose, onSave}) => {
    const [val, setVal] = useState<any>(item);
    useEffect(()=>setVal(item),[item]);
    if(!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white p-6 rounded w-96">
                <h3 className="font-bold mb-4">Z-Raporu Düzenle</h3>
                <label className="block text-xs font-bold mb-1">Toplam Tutar</label>
                <input type="number" value={val?.totalSales} onChange={e=>setVal({...val, totalSales: parseFloat(e.target.value)})} className="border w-full p-2 mb-2"/>
                <div className="flex gap-2 justify-end mt-4">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-slate-50">İptal</button>
                    <button onClick={()=>{onSave(val); onClose();}} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Kaydet</button>
                </div>
            </div>
        </div>
    );
};

// ============================================================================================
// 7. ANA UYGULAMA (APP)
// ============================================================================================

function App() {
  const [activeMode, setActiveMode] = useState<'zreport' | 'tax'>('zreport');
  const [isTestMode, setIsTestMode] = useState(false);
  const [zItems, setZItems] = useState<ZReportData[]>([]);
  const [taxItems, setTaxItems] = useState<TaxDocumentData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isRobotModalOpen, setIsRobotModalOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ZReportData | null>(null);

  const [companies, setCompanies] = useState<Company[]>(() => {
    try { const saved = localStorage.getItem('companies'); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const handleSaveCompanies = (updatedCompanies: Company[]) => {
      setCompanies(updatedCompanies);
      localStorage.setItem('companies', JSON.stringify(updatedCompanies));
  };

  const handleEditCompany = (id: string) => {
      setEditingCompanyId(id);
      setIsCompanyModalOpen(true);
  };

  const handleDownloadRobotKit = async (settings: RobotSettings) => {
      const zip = new JSZip();
      
      // 1. Manifest
      zip.file("manifest.json", JSON.stringify(companies.map(c => ({
          name: c.name,
          matchKeywords: c.matchKeywords,
          email: c.email || "",
          phone: c.phone || ""
      })), null, 2));

      // 2. Config
      zip.file("config.json", JSON.stringify(settings, null, 2));

      // 3. Lib Data (Python Code Base64 encoded)
      zip.file("data.lib", btoa(unescape(encodeURIComponent(PYTHON_SCRIPT_CONTENT))));

      // 4. Loader Script
      zip.file("baslat.py", LOADER_SCRIPT_CONTENT);

      // 5. Readme
      zip.file("OKU_BENI.txt", README_CONTENT);

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Robot_Kurulum_Paketi.zip`;
      link.click();
      setIsRobotModalOpen(false);
      setIsGuideOpen(true); // İndirdikten sonra rehberi aç
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
                  if (!match && item.companyName && item.companyName.length > 2 && item.companyName !== "Tanımsız" && item.companyName !== "HATA") {
                      const newCompany: Company = { id: crypto.randomUUID(), name: item.companyName, matchKeywords: item.companyName };
                      currentCompanies.push(newCompany); match = newCompany; companiesChanged = true;
                  }
                  return { ...item, companyId: match ? match.id : undefined, companyName: match ? match.name : item.companyName };
              });
              newTaxItems.push(...enrichedResults);
            }
          } catch (err) { console.error("Hata:", err); }
        }
        if (companiesChanged) { setCompanies(currentCompanies); localStorage.setItem('companies', JSON.stringify(currentCompanies)); }
        if (newZItems.length > 0) setZItems(prev => [...prev, ...newZItems]);
        if (newTaxItems.length > 0) setTaxItems(prev => [...prev, ...newTaxItems]);
    } finally { setIsProcessing(false); }
  }, [activeMode, isTestMode, companies]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-8 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3"><div className="bg-blue-600 text-white font-bold p-2 rounded-lg">M-AI</div><h1 className="text-xl font-bold text-slate-800">MuhasebeAI <span className="text-blue-600 text-sm">Turbo (Netlify Edition)</span></h1></div>
        <div className="flex gap-2">
          <button onClick={() => setIsTestMode(!isTestMode)} className={`px-3 py-2 rounded-lg text-xs font-bold ${isTestMode ? 'bg-amber-400 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{isTestMode ? 'TEST AKTİF' : 'Test Modu'}</button>
          
          <button onClick={() => { setEditingCompanyId(null); setIsCompanyModalOpen(true); }} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-50 flex items-center gap-2"><span>🏢</span> Firmalar</button>
          
          <button onClick={() => setIsRobotModalOpen(true)} className="bg-green-600 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-green-700 shadow-lg flex items-center gap-2 transition-transform hover:scale-105 active:scale-95 animate-pulse"><span>📥</span> ROBOTU İNDİR</button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto py-10 px-4">
        <div className="flex justify-center mb-6">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
            <button onClick={() => setActiveMode('zreport')} className={`px-10 py-3 rounded-lg text-sm font-bold transition-all ${activeMode === 'zreport' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Z-Raporu</button>
            <button onClick={() => setActiveMode('tax')} className={`px-10 py-3 rounded-lg text-sm font-bold transition-all ${activeMode === 'tax' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Vergi & SGK</button>
          </div>
        </div>

        {/* EKLENEN YENİ BUTON ALANI: Gözden kaçmasını önlemek için */}
        <div className="flex justify-center mb-6">
            <button onClick={() => setIsRobotModalOpen(true)} className="flex items-center gap-2 text-blue-600 bg-blue-50 border border-blue-200 px-4 py-2 rounded-full text-xs font-bold hover:bg-blue-100 transition-colors animate-bounce">
                ✨ Otomatik WhatsApp & Mail Robotunu İndirmek İçin Tıklayın
            </button>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-xl border border-slate-200">
          <UploadSection onFilesSelected={handleFiles} disabled={isProcessing} />
          {isProcessing && <div className="mt-4 text-center text-blue-600 font-medium animate-pulse">Belgeler Analiz Ediliyor...</div>}
          {((activeMode === 'zreport' && zItems.length > 0) || (activeMode === 'tax' && taxItems.length > 0)) && (
            <div className="mt-8 flex justify-end gap-4">
              <button onClick={() => activeMode === 'zreport' ? setZItems([]) : setTaxItems([])} className="px-6 py-3 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50">Temizle</button>
              <button onClick={() => activeMode === 'zreport' ? exportToExcel(zItems) : exportTaxSummaryToExcel(taxItems, companies)} className="px-8 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg">Excel İndir</button>
            </div>
          )}
        </div>
        {activeMode === 'zreport' && zItems.length > 0 && (<ResultTable data={zItems} onUpdateItem={(id, f, v) => setZItems(p => p.map(i => i.id === id ? {...i, [f]:v} : i))} onEditDetails={setEditingItem} />)}
        {activeMode === 'tax' && <TaxDashboard data={taxItems} companies={companies} onEditCompany={handleEditCompany} />}
      </main>
      
      {isCompanyModalOpen && (
        <CompanyManagerModal 
            isOpen={isCompanyModalOpen} 
            onClose={() => { setIsCompanyModalOpen(false); setEditingCompanyId(null); }} 
            companies={companies} 
            onSave={handleSaveCompanies} 
            initialEditId={editingCompanyId}
        />
      )}
      
      {isRobotModalOpen && (
          <RobotConfigModal 
            isOpen={isRobotModalOpen} 
            onClose={() => setIsRobotModalOpen(false)}
            onDownload={handleDownloadRobotKit}
          />
      )}

      {isGuideOpen && (
          <InternalRobotGuide onClose={() => setIsGuideOpen(false)} />
      )}
      
      {editingItem && <EditModal item={editingItem} isOpen={!!editingItem} onClose={() => setEditingItem(null)} onSave={(u:any) => { setZItems(p => p.map(i => i.id === u.id ? u : i)); setEditingItem(null); }} />}
    </div>
  );
}

export default App;
