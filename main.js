// ======================= DANH SÁCH CỘT EXCEL =======================
const ALL_COLS = [
  "Hiển thị trên sổ","Hình thức bán hàng","Phương thức thanh toán","Kiêm phiếu xuất kho",
  "XK vào khu phi thuế quan và các TH được coi như XK","Lập kèm hóa đơn","Đã lập hóa đơn",
  "Ngày hạch toán (*)","Ngày chứng từ (*)","Số chứng từ (*)","Số phiếu xuất","Lý do xuất",
  "Số hóa đơn","Ngày hóa đơn","Mã khách hàng","Tên khách hàng","Địa chỉ","Mã số thuế","Diễn giải",
  "Nộp vào TK","NV bán hàng","Mã hàng (*)","Tên hàng","Hàng khuyến mại","TK Tiền/Chi phí/Nợ (*)",
  "TK Doanh thu/Có (*)","ĐVT","Số lượng","Đơn giá sau thuế","Đơn giá","Thành tiền","Tỷ lệ CK (%)",
  "Tiền chiết khấu","TK chiết khấu","Giá tính thuế XK","% thuế XK","Tiền thuế XK","TK thuế XK",
  "% thuế GTGT","Tỷ lệ tính thuế (Thuế suất KHAC)","Tiền thuế GTGT","TK thuế GTGT",
  "HH không TH trên tờ khai thuế GTGT","Kho","TK giá vốn","TK Kho","Đơn giá vốn","Tiền vốn",
  "Hàng hóa giữ hộ/bán hộ"
];

// ======================= BIẾN LƯU (GIỮ NGUYÊN) =======================
const xmlRows = [];
const seenInvoiceKeys = new Set();

// ======================= BIẾN LƯU BỔ SUNG (HKD = NGƯỜI BÁN) =======================
const sellers = {};   // { mst: { name, rows: [] } }
const sellerOrder = [];
let currentSeller = null;

// ======================= FLATTEN XML (GIỮ NGUYÊN) =======================
function flattenXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const map = {};
  function walk(node, path) {
    const children = Array.from(node.children || []);
    if (children.length === 0) {
      const text = (node.textContent || "").trim();
      if (text) map[path] = text;
      return;
    }
    const counter = {};
    for (const child of children) {
      const name = child.nodeName;
      counter[name] = (counter[name] || 0) + 1;
      const idx = counter[name];
      const hasMany = children.filter(n => n.nodeName === name).length > 1;
      const childPath = `${path}.${name}${hasMany ? `[${idx}]` : ""}`;
      walk(child, childPath);
    }
  }
  walk(doc.documentElement, doc.documentElement.nodeName);
  return map;
}

// ======================= MAP CỘT ↔ XML (GIỮ NGUYÊN) =======================
const XML_MAPPING = {
  "Ngày hạch toán (*)": "HDon.DLHDon.TTChung.NLap",
  "Ngày chứng từ (*)": "HDon.DLHDon.TTChung.NLap",
  "Ngày hóa đơn": "HDon.DLHDon.TTChung.NLap",
  "Số chứng từ (*)": "HDon.DLHDon.TTChung.SHDon",
  "Số phiếu xuất": "HDon.DLHDon.TTChung.SHDon",
  "Số hóa đơn": "HDon.DLHDon.TTChung.SHDon",
  "Tên khách hàng": "HDon.DLHDon.NDHDon.NMua.Ten",
  "Mã số thuế": "HDon.DLHDon.NDHDon.NMua.MST",
  "Địa chỉ": "HDon.DLHDon.NDHDon.NMua.DChi",
  "Mã hàng (*)": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.MHHDVu",
  "Tên hàng": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.THHDVu",
  "ĐVT": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.DVTinh",
  "Số lượng": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.SLuong",
  "Đơn giá": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.DGia",
  "Thành tiền": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.ThTien",
  "% thuế GTGT": "HDon.DLHDon.NDHDon.DSHHDVu.HHDVu.TSuat",
  "Tiền thuế GTGT": "HDon.DLHDon.NDHDon.TToan.THTTLTSuat.LTSuat.TThue"
};

// ======================= XỬ LÝ CHUỖI (GIỮ NGUYÊN) =======================
function stripVN(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}
function removeVietnameseAccents(str) {
  return str.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// ======================= SINH MÃ SP (GIỮ NGUYÊN) =======================
function removeVietnameseAccents(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}
function generateProductCodeByName(productName) {
  if (!productName) return "";
  let clean = removeVietnameseAccents(productName.toUpperCase().trim());
  const words = clean.split(/\s+/).filter(w => w && !/^\d/.test(w) && !w.startsWith("("));
  let prefix = words.map(w => w[0]).join("");
  let numberPart = "";
  const matchNumUnit = clean.match(/(\d+[A-Z]+)/);
  if (matchNumUnit) numberPart = matchNumUnit[1];
  let bracketPart = "";
  const matchBracket = clean.match(/\(([^)]+)\)/);
  if (matchBracket) {
    const inner = matchBracket[1].trim();
    if (inner) bracketPart = "_" + inner[0];
  }
  return prefix + numberPart + bracketPart;
}

// ======================= TẠO MÃ KH (GIỮ NGUYÊN) =======================
function generateCustomerCode(name) {
  if (!name) return "KH_XXX";
  const clean = removeVietnameseAccents(name.toUpperCase().trim());
  const words = clean.split(/\s+/).filter(Boolean);
  let code = words.map(w => w[0]).join("").substring(0, 5);
  return "KH_" + code.padEnd(5, "X");
}

// ======================= TẠO ROW (GIỮ NGUYÊN) =======================
function buildRow(flatMap) {
  const row = {};
  for (const col of ALL_COLS) {
    if (XML_MAPPING[col]) {
      row[col] = flatMap[XML_MAPPING[col]] || "";
    } else {
      row[col] = "";
    }
  }
  const donGia = parseFloat(row["Đơn giá"] || 0);
  const thue = parseFloat((row["% thuế GTGT"] || "").replace("%","") || 0);
  row["Đơn giá sau thuế"] = donGia + (donGia * thue / 100);
  row["TK Kho"] = "156";
  row["TK giá vốn"] = "632";
  row["TK thuế GTGT"] = "33311";
  row["Mã khách hàng"] = generateCustomerCode(row["Tên khách hàng"]);
  if (!row["Mã hàng (*)"]) {
    row["Mã hàng (*)"] = generateProductCodeByName(row["Tên hàng"]);
  }
  return row;
}

// ======================= FORMAT DATE (GIỮ NGUYÊN) =======================
function formatDate(val) {
  if (!val) return "";
  const match = val.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  const match2 = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match2) return val;
  return val;
}

// ======================= RENDER BẢNG (GIỮ NGUYÊN LOGIC, CHO PHÉP TRUYỀN DANH SÁCH) =======================
function renderXmlTable(rowsArg) {
  const rows = Array.isArray(rowsArg) ? rowsArg : xmlRows; // nếu không truyền → dùng toàn bộ
  const mainContent = document.getElementById("mainContent");
  if (!mainContent) return;

  Object.assign(mainContent.style, {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 120px)",
    overflow: "hidden",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  });

  let html = `
    <style>
      #xmlTableContainer{flex:1;overflow:auto;border:1px solid #e0e0e0;border-radius:4px;background:white;}
      #xmlTable{border-collapse:collapse;min-width:1200px;width:100%;font-size:13px;}
      #xmlTable thead th{border:1px solid #d0d0d0;background:#f0f5ff;position:sticky;top:0;z-index:2;font-weight:600;white-space:nowrap;padding:10px 8px;color:#2c3e50;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,0.05);}
      #xmlTable tbody td{border:1px solid #e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;padding:6px 8px;height:28px;max-height:28px;line-height:1.3;}
      #xmlTable tbody tr{transition:background-color 0.15s;}
      #xmlTable tbody tr:hover{background-color:#f8f9fa;}
      #xmlTable tbody tr:nth-child(even){background-color:#f9f9f9;}
      #xmlTable tbody tr:nth-child(even):hover{background-color:#f0f4f8;}
      .table-header{margin:10px 0 12px 0;font-size:18px;font-weight:600;color:#2c3e50;padding-bottom:8px;border-bottom:2px solid #eaeaea;}
    </style>
    <div class="table-header">📄 Bảng tổng hợp hóa đơn xuất hàng ${rows===xmlRows?"":"— lọc theo HKD"}</div>
    <div id="xmlTableContainer">
      <table id="xmlTable">
        <thead><tr>
          ${ALL_COLS.map(c => `<th>${c}</th>`).join("")}
        </tr></thead>
        <button onclick="exportCurrentTable()">📤 Xuất Excel</button>

        <tbody>
  `;

  rows.forEach((row, rIdx) => {
    html += "<tr>";
    ALL_COLS.forEach((col) => {
      let val = row[col] || "";
      if (["Ngày hạch toán (*)", "Ngày chứng từ (*)", "Ngày hóa đơn"].includes(col)) {
        val = formatDate(val);
      }
      html += `<td contenteditable="true" data-row="${rIdx}" data-col="${col}">${val}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table></div>";
  mainContent.innerHTML = html;

  // ✅ Editable: cập nhật trực tiếp vào mảng đang hiển thị (rows).
  // Vì mỗi phần tử là object chung với xmlRows, chỉnh sửa ở đây cũng áp vào dữ liệu gốc.
  document.querySelectorAll("#xmlTable td[contenteditable]").forEach(td => {
    td.addEventListener("blur", e => {
      const rowIndex = parseInt(td.getAttribute("data-row"));
      const colName = td.getAttribute("data-col");
      let newValue = td.innerText.trim();
      if (["Ngày hạch toán (*)", "Ngày chứng từ (*)", "Ngày hóa đơn"].includes(colName)) {
        newValue = formatDate(newValue);
        td.innerText = newValue;
      }
      rows[rowIndex][colName] = newValue;
      saveXmlRows();
    });
  });
}

// ======================= DANH SÁCH HKD BÊN TRÁI (MỚI THÊM) =======================
function renderSellerList() {
  const ul = document.getElementById("businessList");
  if (!ul) return;
  ul.innerHTML = "";
  sellerOrder.forEach(mst => {
    const info = sellers[mst];
    const li = document.createElement("li");
    li.classList.add("hkd-item");
    li.innerHTML = `<div><strong>${mst}</strong></div><div class="hkd-name">${info.name}</div>`;
    li.onclick = () => {
      currentSeller = mst;
      renderXmlTableForSeller(mst);
    };
    ul.appendChild(li);
  });
}

// ======================= HIỂN THỊ BẢNG KHI CLICK HKD (MỚI THÊM) =======================
function renderXmlTableForSeller(mst) {
  const pack = sellers[mst];
  const rows = pack ? pack.rows : [];
  const mainContent = document.getElementById("mainContent");
  if (mainContent) {
    mainContent.innerHTML = `<h2 style="font-size:20px;font-weight:700;color:#007bff;margin:8px 0;">🏢 ${pack?.name || mst} (${mst})</h2>`;
  }
  renderXmlTable(rows);
}

// ======================= GOM SELLER (MỚI THÊM) =======================
function addRowToSeller(row) {
  const mst = row.__sellerMST || "UNKNOWN";
  const name = row.__sellerName || mst;
  if (!sellers[mst]) {
    sellers[mst] = { name, rows: [] };
    sellerOrder.push(mst);
  }
  sellers[mst].rows.push(row);
}
function rebuildSellersFromXmlRows() {
  // clear
  for (const k in sellers) delete sellers[k];
  sellerOrder.length = 0;
  // rebuild
  for (const row of xmlRows) addRowToSeller(row);
  renderSellerList();
}

// ======================= HANDLE FILES (GIỮ LOGIC CŨ + GOM HKD) =======================
async function handleFiles(filesInput) {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(document.getElementById("zipFile").files);

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      window.showToast?.(`⚠️ Bỏ qua: ${file.name}`, 2000, "info");
      continue;
    }
    try {
      const xmlText = await file.text();
      const flatMap = flattenXml(xmlText);

      // Khóa duy nhất: ưu tiên MCCQT, fallback SHDon (GIỮ)
      const keyInvoice = flatMap["HDon.MCCQT"] || flatMap["HDon.DLHDon.TTChung.SHDon"] || "";
      if (!keyInvoice) {
        window.showToast?.(`❌ Không tìm thấy MCCQT/Số HĐ trong ${file.name}`, 2000, "error");
        continue;
      }
      if (seenInvoiceKeys.has(keyInvoice)) {
        window.showToast?.(`⚠️ Trùng hóa đơn: ${keyInvoice}`, 2000, "info");
        continue;
      }
      seenInvoiceKeys.add(keyInvoice);

      // Tạo row theo logic gốc
      const row = buildRow(flatMap);

      // 👉 Gắn thuộc tính ẩn để quản lý người bán (KHÔNG ảnh hưởng cột hiển thị)
      row.__sellerMST  = flatMap["HDon.DLHDon.NDHDon.NBan.MST"] || "UNKNOWN";
      row.__sellerName = flatMap["HDon.DLHDon.NDHDon.NBan.Ten"] || row.__sellerMST;

      // Lưu vào tập tổng
      xmlRows.push(row);

      // Gom vào HKD
      addRowToSeller(row);

    } catch (err) {
      console.error("❌ Lỗi xử lý:", file.name, err);
      window.showToast?.(`❌ Lỗi file ${file.name}: ${err.message}`, 2000, "error");
    }
  }

  // Sau khi import: chỉ hiển thị danh sách HKD; người dùng click HKD để xem bảng
  renderSellerList();
  saveXmlRows();
}

// ======================= SAVE & LOAD (GIỮ NGUYÊN, THÊM REBUILD HKD) =======================
function saveXmlRows() {
  window.localStorage.setItem("xmlRows", JSON.stringify(xmlRows));
  window.showToast?.("💾 Đã lưu dữ liệu", 1500, "success");
}
function loadXmlRows() {
  const saved = window.localStorage.getItem("xmlRows");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data)) {
        xmlRows.length = 0;
        xmlRows.push(...data);
        // rebuild danh sách HKD từ dữ liệu đã lưu
        rebuildSellersFromXmlRows();
        window.showToast?.("📂 Đã tải dữ liệu đã lưu", 1500, "info");
      }
    } catch (e) {
      console.error("❌ Lỗi khi đọc localStorage:", e);
    }
  }
}

// ======================= CLEAR (GIỮ NGUYÊN + DỌN SELLER) =======================
function clearXmlRows() {
  if (!confirm("❓ Bạn có chắc muốn xóa toàn bộ dữ liệu đã lưu?")) return;
  xmlRows.length = 0;
  seenInvoiceKeys.clear();
  window.localStorage.removeItem("xmlRows");
  for (const k in sellers) delete sellers[k];
  sellerOrder.length = 0;
  currentSeller = null;
  renderSellerList();
  renderXmlTable([]); // hiển thị bảng trống
  window.showToast?.("🗑️ Đã xóa toàn bộ dữ liệu", 2000, "success");
}

// ======================= INIT (GIỮ NGUYÊN) =======================
document.addEventListener("DOMContentLoaded", () => {
  loadXmlRows();
  // Không renderXmlTable(xmlRows) ngay — đợi người dùng click HKD
  // Nếu muốn tự mở HKD đầu tiên sau load:
  // if (sellerOrder.length) renderXmlTableForSeller(sellerOrder[0]);

  // expose cho HTML
  window.handleFiles = handleFiles;
  window.clearXmlRows = clearXmlRows;
});

// ===== Helper loại dấu tiếng Việt (trùng mã gốc – giữ nguyên) =====
function stripVN(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

// ===== Tạo Mã khách hàng (bản đầy đủ như gốc – giữ nguyên) =====
function buildCustomerCode(name = "") {
  const s = stripVN(name).trim();
  if (!s) return "KH_XXXXX";
  const tokens = s.split(/\s+/);
  let acc = "";
  for (const tRaw of tokens) {
    const t = tRaw.replace(/[^A-Za-z0-9]/g, "");
    if (!t) continue;
    acc += t[0].toUpperCase();
    if (acc.length >= 5) break;
  }
  if (acc.length < 5) {
    for (const tRaw of tokens) {
      const t = tRaw.replace(/[^A-Za-z0-9]/g, "");
      for (let i = 1; i < t.length && acc.length < 5; i++) {
        acc += t[i].toUpperCase();
      }
      if (acc.length >= 5) break;
    }
  }
  if (acc.length < 5) acc = (acc + "XXXXX").slice(0, 5);
  return `KH_${acc}`;
}

// ===== Tạo Mã hàng (bản đầy đủ như gốc – giữ nguyên) =====
function buildProductCode(productName = "") {
  const s = stripVN(productName).toLowerCase();
  if (!s) return "mhxxx";
  const words = (s.match(/[a-z]+/g) || []);
  const digits = (s.match(/\d+/) || [""])[0];
  let alpha = "";
  if (words.length) {
    let longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
    if (longest.length >= 3) alpha = longest.slice(-3);
    else {
      const join = words.join("");
      alpha = (join + "xxx").slice(0, 3);
    }
  } else {
    alpha = "mhx";
  }
  return `${alpha}${digits}`;
}
//
// ======================= XUẤT EXCEL =======================
function exportExcel(rows, filename = "export.xlsx") {
  if (!rows || !rows.length) {
    alert("⚠️ Không có dữ liệu để xuất Excel");
    return;
  }

  // Chuẩn bị dữ liệu dạng 2D array: [header, ...rows]
  const header = ALL_COLS;
  const data = [header];
  rows.forEach(r => {
    data.push(header.map(c => r[c] || ""));
  });

  // Tạo worksheet & workbook
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  // Xuất file
  XLSX.writeFile(wb, filename);
}

// ======================= NÚT XUẤT (CHO UI) =======================
function exportCurrentTable() {
  if (currentSeller) {
    const pack = sellers[currentSeller];
    if (pack) {
      exportExcel(pack.rows, `HKD_${currentSeller}.xlsx`);
    }
  } else {
    exportExcel(xmlRows, "AllData.xlsx");
  }
}

// Expose cho HTML
window.exportCurrentTable = exportCurrentTable;
