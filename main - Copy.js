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

// ======================= BIẾN LƯU =======================
const xmlRows = [];
const seenInvoiceKeys = new Set();

// ======================= FLATTEN XML =======================
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

// ======================= MAP CỘT ↔ XML =======================
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

// ======================= TẠO ROW =======================
// ======================= XỬ LÝ CHUỖI =======================
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



// ======================= SINH MÃ SP =======================
function removeVietnameseAccents(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

function generateProductCodeByName(productName) {
  if (!productName) return "";

  let clean = removeVietnameseAccents(productName.toUpperCase().trim());

  // 1. Lấy ký tự đầu mỗi từ (bỏ số và bỏ từ trong ngoặc)
  const words = clean.split(/\s+/).filter(w => w && !/^\d/.test(w) && !w.startsWith("("));
  let prefix = words.map(w => w[0]).join("");

  // 2. Tìm cụm số + đơn vị (330ML, 500G, 24LON...)
  let numberPart = "";
  const matchNumUnit = clean.match(/(\d+[A-Z]+)/);
  if (matchNumUnit) {
    numberPart = matchNumUnit[1];
  }

  // 3. Nếu có ngoặc → lấy chữ cái đầu tiên trong ngoặc
  let bracketPart = "";
  const matchBracket = clean.match(/\(([^)]+)\)/);
  if (matchBracket) {
    const inner = matchBracket[1].trim();
    if (inner) bracketPart = "_" + inner[0];
  }

  return prefix + numberPart + bracketPart;
}


// ======================= TẠO MÃ KH =======================
function generateCustomerCode(name) {
  if (!name) return "KH_XXX";
  const clean = removeVietnameseAccents(name.toUpperCase().trim());
  const words = clean.split(/\s+/).filter(Boolean);

  let code = words.map(w => w[0]).join("").substring(0, 5);
  return "KH_" + code.padEnd(5, "X");
}

// ======================= TẠO ROW =======================
function buildRow(flatMap) {
  const row = {};
  for (const col of ALL_COLS) {
    if (XML_MAPPING[col]) {
      row[col] = flatMap[XML_MAPPING[col]] || "";
    } else {
      row[col] = "";
    }
  }

  // ✅ Tính "Đơn giá sau thuế"
  const donGia = parseFloat(row["Đơn giá"] || 0);
  const thue = parseFloat((row["% thuế GTGT"] || "").replace("%","") || 0);
  row["Đơn giá sau thuế"] = donGia + (donGia * thue / 100);

  // ✅ Gán mặc định
  row["TK Kho"] = "156";
  row["TK giá vốn"] = "632";
  row["TK thuế GTGT"] = "33311";

  // ✅ Mã khách hàng
  row["Mã khách hàng"] = generateCustomerCode(row["Tên khách hàng"]);

  // ✅ Mã hàng: nếu trống thì sinh mới
  if (!row["Mã hàng (*)"]) {
    row["Mã hàng (*)"] = generateProductCodeByName(row["Tên hàng"]);
  }

  return row;
}



// ======================= FORMAT DATE =======================
function formatDate(val) {
  if (!val) return "";
  // Nhận dạng yyyy-mm-dd hoặc yyyy/mm/dd
  const match = val.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  // Nếu đã đúng dạng dd/mm/yyyy thì giữ nguyên
  const match2 = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match2) return val;
  return val;
}

// ======================= RENDER BẢNG =======================
function renderXmlTable() {
  const mainContent = document.getElementById("mainContent");
  if (!mainContent) return;

  // Thiết lập CSS cho container chính
  Object.assign(mainContent.style, {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 120px)",
    overflow: "hidden",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  });

  let html = `
    <style>
      #xmlTableContainer {
        flex: 1;
        overflow: auto;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        background: white;
      }
      #xmlTable {
        border-collapse: collapse;
        min-width: 1200px;
        width: 100%;
        font-size: 13px;
      }
      #xmlTable thead th {
        border: 1px solid #d0d0d0;
        background: #f0f5ff;
        position: sticky;
        top: 0;
        z-index: 2;
        font-weight: 600;
        white-space: nowrap;
        padding: 10px 8px;
        color: #2c3e50;
        font-size: 14px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      }
      #xmlTable tbody td {
        border: 1px solid #e8e8e8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
        padding: 6px 8px;
        height: 28px;
        max-height: 28px;
        line-height: 1.3;
      }
      #xmlTable tbody tr {
        transition: background-color 0.15s;
      }
      #xmlTable tbody tr:hover {
        background-color: #f8f9fa;
      }
      #xmlTable tbody tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      #xmlTable tbody tr:nth-child(even):hover {
        background-color: #f0f4f8;
      }
      .table-header {
        margin: 10px 0 12px 0;
        font-size: 18px;
        font-weight: 600;
        color: #2c3e50;
        padding-bottom: 8px;
        border-bottom: 2px solid #eaeaea;
      }
    </style>
    <div class="table-header">📄 Bảng tổng hợp XML (1 file = 1 dòng)</div>
    <div id="xmlTableContainer">
      <table id="xmlTable">
        <thead><tr>
          ${ALL_COLS.map(c => `<th>${c}</th>`).join("")}
        </tr></thead>
        <tbody>
  `;

  xmlRows.forEach((row, rIdx) => {
    html += "<tr>";
    ALL_COLS.forEach((col) => {
      let val = row[col] || "";

      // Nếu cột là ngày thì format lại
      if (["Ngày hạch toán (*)", "Ngày chứng từ (*)", "Ngày hóa đơn"].includes(col)) {
        val = formatDate(val);
      }

      html += `
        <td 
          contenteditable="true" 
          data-row="${rIdx}" 
          data-col="${col}">${val}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table></div>";
  mainContent.innerHTML = html;

  // ✅ Bắt sự kiện chỉnh sửa ô
  document.querySelectorAll("#xmlTable td[contenteditable]").forEach(td => {
    td.addEventListener("blur", e => {
      const rowIndex = parseInt(td.getAttribute("data-row"));
      const colName = td.getAttribute("data-col");
      let newValue = td.innerText.trim();

      // Nếu là cột ngày thì chuẩn hóa về dd/MM/yyyy
      if (["Ngày hạch toán (*)", "Ngày chứng từ (*)", "Ngày hóa đơn"].includes(colName)) {
        newValue = formatDate(newValue);
        td.innerText = newValue; // update lại hiển thị
      }

      // cập nhật dữ liệu
      xmlRows[rowIndex][colName] = newValue;

      // lưu lại
      saveXmlRows();
    });
  });
}



// ======================= HANDLE FILES =======================
async function handleFiles(filesInput) {
  const files = Array.isArray(filesInput) ? filesInput : Array.from(document.getElementById("zipFile").files);

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      window.showToast(`⚠️ Bỏ qua: ${file.name}`, 2000, "info");
      continue;
    }
    try {
      const xmlText = await file.text();
      const flatMap = flattenXml(xmlText);

      // ✅ Khóa duy nhất: ưu tiên MCCQT, fallback sang SHDon
      const keyInvoice = flatMap["HDon.MCCQT"] || flatMap["HDon.DLHDon.TTChung.SHDon"] || "";
      if (!keyInvoice) {
        window.showToast(`❌ Không tìm thấy MCCQT/Số HĐ trong ${file.name}`, 2000, "error");
        continue;
      }
      if (seenInvoiceKeys.has(keyInvoice)) {
        window.showToast(`⚠️ Trùng hóa đơn: ${keyInvoice}`, 2000, "info");
        continue;
      }
      seenInvoiceKeys.add(keyInvoice);

      const row = buildRow(flatMap);
      xmlRows.push(row);
    } catch (err) {
      console.error("❌ Lỗi xử lý:", file.name, err);
      window.showToast(`❌ Lỗi file ${file.name}: ${err.message}`, 2000, "error");
    }
  }

  renderXmlTable();
  saveXmlRows();
}

// ======================= SAVE & LOAD =======================
function saveXmlRows() {
  window.localStorage.setItem("xmlRows", JSON.stringify(xmlRows));
  window.showToast("💾 Đã lưu dữ liệu", 1500, "success");
}

function loadXmlRows() {
  const saved = window.localStorage.getItem("xmlRows");
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (Array.isArray(data)) {
        xmlRows.length = 0;
        xmlRows.push(...data);
        renderXmlTable();
        window.showToast("📂 Đã tải dữ liệu đã lưu", 1500, "info");
      }
    } catch (e) {
      console.error("❌ Lỗi khi đọc localStorage:", e);
    }
  }
}

// ======================= INIT =======================
document.addEventListener("DOMContentLoaded", () => {
  loadXmlRows();
});
function clearXmlRows() {
  if (!confirm("❓ Bạn có chắc muốn xóa toàn bộ dữ liệu đã lưu?")) return;
  xmlRows.length = 0;
  seenInvoiceKeys.clear();
  window.localStorage.removeItem("xmlRows");
  renderXmlTable();
  window.showToast("🗑️ Đã xóa toàn bộ dữ liệu", 2000, "success");
}


/////
// ===== Helper loại dấu tiếng Việt =====
function stripVN(s = "") {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");
}

// ===== Tạo Mã khách hàng: KH_ + 5 ký tự (ưu tiên chữ cái đầu mỗi từ, có thể lấy số), thiếu thì pad 'X' =====
function buildCustomerCode(name = "") {
  const s = stripVN(name).trim();
  if (!s) return "KH_XXXXX";

  const tokens = s.split(/\s+/);
  let acc = "";

  for (const tRaw of tokens) {
    const t = tRaw.replace(/[^A-Za-z0-9]/g, "");
    if (!t) continue;
    // ưu tiên ký tự đầu của token
    acc += t[0].toUpperCase();
    if (acc.length >= 5) break;
  }

  // Nếu vẫn thiếu, thử “mượn” chữ/số tiếp theo trong từng token
  if (acc.length < 5) {
    for (const tRaw of tokens) {
      const t = tRaw.replace(/[^A-Za-z0-9]/g, "");
      for (let i = 1; i < t.length && acc.length < 5; i++) {
        acc += t[i].toUpperCase();
      }
      if (acc.length >= 5) break;
    }
  }

  // Nếu còn thiếu nữa, pad 'X'
  if (acc.length < 5) acc = (acc + "XXXXX").slice(0, 5);

  return `KH_${acc}`;
}

// ===== Tạo Mã hàng: 3 chữ cái (từ từ dài nhất, lấy 3 ký tự cuối) + số trong tên (nếu có). Ví dụ "Heineken 250" -> "ken250" =====
function buildProductCode(productName = "") {
  const s = stripVN(productName).toLowerCase();
  if (!s) return "mhxxx";

  const words = (s.match(/[a-z]+/g) || []);
  const digits = (s.match(/\d+/) || [""])[0]; // lấy cụm số đầu tiên nếu có

  let alpha = "";
  if (words.length) {
    // lấy từ có độ dài lớn nhất
    let longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
    if (longest.length >= 3) alpha = longest.slice(-3);
    else {
      // nếu từ dài nhất < 3, ghép các từ đến >=3
      const join = words.join("");
      alpha = (join + "xxx").slice(0, 3);
    }
  } else {
    alpha = "mhx"; // không có chữ cái nào
  }

  return `${alpha}${digits}`;
}
