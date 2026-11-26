// Pure helpers for output profiles: name matching, value detection, and preview.
// Loaded by index.html and by tests/output-profile.test.mjs. No DOM.
(function (root) {
  var FIXED_SOURCE = '__fixed__';

  function norm(s) {
    return (s || '').toString()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
  function fold(s) {
    return norm(String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }

  var SOURCE_FIELDS = [
    { k:'Tarifnummer', s:'HS code', syn:['tarifnummer','warennr','hs code','hs','commodity code','customs code','tariff','tariff number','zollnummer','cn code','taric','customs tariff'] },
    { k:'Artikelnummer', s:'Article no.', syn:['artikelnummer','artikelnr','article number','article no','article','sku','item number','item no','product number','product no','art nr','art-nr'] },
    { k:'Warenbeschreibung', s:'Description', syn:['warenbeschreibung','warenbezeichnung','description','goods description','article description','bezeichnung','product name','desc','designation','désignation'] },
    { k:'Ursprung', s:'Origin', syn:['ursprung','ursprungsland','country of origin','origin','coo','herkunft','herkunftsland','pays origine','origine'] },
    { k:'Rechnungsbetrag', s:'Amount', syn:['rechnungsbetrag','preis','price','total price','invoice amount','net amount','amount','value','betrag','customs value','net value','montant'] },
    { k:'Währung', s:'Currency', syn:['währung','waehrung','currency','currency code','curr','devise'] },
    { k:'Rohmasse', s:'Gross weight', syn:['rohmasse','gross weight','gross mass','bruttogewicht','bruttomasse','poids brut'] },
    { k:'Eigenmasse', s:'Net weight', syn:['eigenmasse','net weight','net mass','nettogewicht','nettomasse','poids net'] },
    { k:'Menge', s:'Quantity', syn:['menge','quantity','qty','units','unit','supplementary units'] },
    { k:'Invoice No', s:'Invoice no.', syn:['invoice no','invoice number','invoice','rechnungsnummer','inv no','rechnung nr'] },
    { k:'PR', s:'Preference', syn:['pr','preference','präferenz','praeferenz','preferenz'] },
    { k:'TN Schlüssel', s:'TN key', syn:['tn schlüssel','tn schluessel','tn key','tn code'] },
    { k:'Stat.Zusatz', s:'Stat. quantity', syn:['stat zusatz','stat zusatzmenge','zusatzmenge','supplementary quantity','statistical quantity'] },
    { k:'Anzahl', s:'Packages (Anzahl box)', syn:['anzahl','colli','packages','packs','packstueckanzahl','number of packages','parcel count'] },
  ];

  function matchSourceField(columnName) {
    var n = fold(columnName);
    if (!n) return '';
    for (var i = 0; i < SOURCE_FIELDS.length; i++) {
      var f = SOURCE_FIELDS[i];
      if (fold(f.k) === n || fold(f.s) === n) return f.k;
      if ((f.syn || []).some(function (s) { return fold(s) === n; })) return f.k;
    }
    return '';
  }

  var ISO2 = new Set('AT BE BG CH CN CY CZ DE DK EE ES FI FR GB GR HR HU IE IT JP KR LT LU LV MT MX NL NO PL PT RO SE SI SK TR US VN IN BR CA AU NZ AE SA TH MY SG HK ID PH TW UA RS BA MK AL IS LI'.split(' '));
  var ISO_CUR = new Set('USD EUR CHF GBP JPY CNY CAD AUD SEK NOK DKK PLN CZK HUF RON BGN TRY INR KRW SGD HKD THB MYR VND MXN BRL ZAR AED SAR NZD'.split(' '));

  function columnValues(values) {
    return (values || []).map(function (v) { return v == null ? '' : String(v).trim(); }).filter(Boolean).slice(0, 12);
  }
  function valueRatio(values, pred) {
    if (!values.length) return 0;
    return values.filter(pred).length / values.length;
  }
  function looksLikeHs(v) {
    var d = String(v).replace(/[\s.]/g, '');
    return /^\d{6}$/.test(d) || /^\d{8}$/.test(d) || /^\d{10}$/.test(d);
  }
  function detectContentField(values) {
    var vals = columnValues(values);
    if (!vals.length) return '';
    if (valueRatio(vals, looksLikeHs) >= 0.6) return 'Tarifnummer';
    if (valueRatio(vals, function (v) { return ISO2.has(v.toUpperCase()); }) >= 0.6) return 'Ursprung';
    if (valueRatio(vals, function (v) { return ISO_CUR.has(v.toUpperCase()); }) >= 0.6) return 'Währung';
    return '';
  }
  function detectField(header, values) {
    var byName = matchSourceField(header);
    var byContent = detectContentField(values);
    if (byName && byContent === byName) return { field: byName, score: 140, confidence: 'high', via: 'name+values' };
    if (byName && byContent && byContent !== byName) return { field: byName, score: 80, confidence: 'medium', via: 'name' };
    if (byName) return { field: byName, score: 100, confidence: 'high', via: 'name' };
    if (byContent) return { field: byContent, score: 65, confidence: 'medium', via: 'values' };
    return null;
  }
  function confidenceTag(m) {
    if (!m) return null;
    if (m.fromSaved) return { cls: 'saved', text: 'Saved', title: 'This column layout was validated before' };
    if (m.confidence === 'high' && m.via === 'name+values') return { cls: 'high', text: 'Auto', title: 'The name and the values agree' };
    if (m.confidence === 'high') return { cls: 'high', text: 'Auto', title: 'Matched by name' };
    if (m.confidence === 'medium' && m.via === 'values') return { cls: 'medium', text: 'Likely', title: 'Guessed from the values in this column' };
    if (m.confidence === 'medium') return { cls: 'medium', text: 'Check', title: 'The name and the values do not agree' };
    return null;
  }
  function autoMapSourceFields(headers, fields, rows) {
    var wanted = new Set((fields || []).map(function (f) { return f.k; }));
    var scored = [];
    headers.forEach(function (h, i) {
      var values = (rows || []).slice(0, 30).map(function (r) { return r[i]; });
      var det = detectField(h, values);
      if (!det || !wanted.has(det.field)) return;
      scored.push({ i: i, field: det.field, score: det.score, confidence: det.confidence, via: det.via });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var mapping = {};
    var usedCols = new Set();
    var usedFields = new Set();
    scored.forEach(function (s) {
      if (usedCols.has(s.i) || usedFields.has(s.field)) return;
      usedCols.add(s.i);
      usedFields.add(s.field);
      mapping[s.field] = { colIndex: s.i, confidence: s.confidence, via: s.via, auto: true, skipped: false };
    });
    return mapping;
  }
  function buildColumnObjects(names, samples) {
    return (names || []).map(function (name, i) {
      var values = (samples || []).map(function (r) { return r[i]; });
      var det = detectField(name, values);
      return {
        name: name,
        source: det ? det.field : '',
        fixed: '',
        auto: det ? det.field : '',
        confidence: det ? det.confidence : '',
        via: det ? det.via : '',
        manual: false,
      };
    });
  }
  function fieldLabel(key) {
    if (key === FIXED_SOURCE) return 'Fixed value';
    var f = SOURCE_FIELDS.find(function (x) { return x.k === key; });
    return f ? f.s : (key || 'Empty');
  }
  // One preview cell. formatValue(source, raw) turns a client-file value into the export text.
  function previewProfileCell(col, colIndex, rowIndex, draft, formatValue) {
    var templateRow = ((draft && draft.sampleRows) || [])[rowIndex] || [];
    var example = templateRow[colIndex] || '';
    if (!col.source) return { text: example || '—', kind: example ? 'example' : 'empty' };
    if (col.source === FIXED_SOURCE) return { text: col.fixed || '—', kind: 'fixed' };
    if (col.source === 'Anzahl') return { text: 'Anzahl', kind: 'fixed' };
    var client = draft && draft.clientSample;
    if (client) {
      var map = draft.clientFieldMap || {};
      var srcCol = Object.keys(map).find(function (k) { return map[k] === col.source; });
      if (srcCol != null && client.rows[rowIndex]) {
        var raw = client.rows[rowIndex][Number(srcCol)];
        var v = formatValue ? formatValue(col.source, raw) : raw;
        return { text: v === '' || v == null ? '—' : String(v), kind: 'live' };
      }
    }
    return { text: example || '—', kind: example ? 'example' : 'empty' };
  }

  var api = {
    FIXED_SOURCE: FIXED_SOURCE,
    SOURCE_FIELDS: SOURCE_FIELDS,
    norm: norm,
    fold: fold,
    matchSourceField: matchSourceField,
    detectField: detectField,
    detectContentField: detectContentField,
    confidenceTag: confidenceTag,
    autoMapSourceFields: autoMapSourceFields,
    buildColumnObjects: buildColumnObjects,
    fieldLabel: fieldLabel,
    previewProfileCell: previewProfileCell,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  Object.keys(api).forEach(function (k) { root[k] = api[k]; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
