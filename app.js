const { useEffect, useMemo, useState } = React;

const STORAGE_KEY = "ce-event-library-v3";
const DATA_TYPES = ["text", "integer", "float", "date"];
const ARRAY_GROUP_NAMES = [
  "items",
  "item",
  "products",
  "product",
  "courses",
  "course",
  "line_items",
  "lineitems",
  "line items",
  "cart_items",
  "cartitems",
  "collection",
  "product_collection",
  "products_collection",
];

let idCounter = 1;
const uid = (prefix) => `${prefix}_${idCounter++}`;

const safeString = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

const normalizeHeader = (value) =>
  safeString(value)
    .toLowerCase()
    .replace(/[\s_/]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .trim();

const normalizeSnakeCase = (value) => {
  if (!value) return "";
  let text = safeString(value);
  text = text.replace(/^[•\-–—\s]+/, "");
  text = text.replace(/^\s*\d+(?:\.[a-zA-Z]+)*[.)-]?\s*/, "");
  text = text.replace(/[\[\](){}]/g, " ");
  text = text.replace(/[.\/]+/g, " ");
  text = text.replace(/\s+/g, " ");
  text = text.toLowerCase();
  text = text.replace(/[^a-z0-9]+/g, "_");
  text = text.replace(/^_+|_+$/g, "");
  return text;
};

const normalizeUpperSnakeCase = (value) => {
  const normalized = normalizeSnakeCase(value);
  return normalized ? normalized.toUpperCase() : "";
};

const normalizeDataType = (value) => {
  const text = safeString(value).toLowerCase();
  if (!text) return "";
  const hasText = ["text", "string", "str", "varchar", "char", "uuid", "email", "url"].some((t) => text.includes(t));
  const hasInt = ["int", "integer", "count", "whole"].some((t) => text.includes(t));
  const hasFloat = ["float", "decimal", "double", "number", "amount", "price", "revenue", "currency"].some((t) =>
    text.includes(t)
  );
  const hasDate = ["date", "datetime", "timestamp", "time"].some((t) => text.includes(t));

  if (hasText) {
    return "text";
  }
  if (hasDate) {
    return "date";
  }
  if (hasFloat && hasInt) {
    return "float";
  }
  if (hasFloat) {
    return "float";
  }
  if (hasInt) {
    return "integer";
  }
  return "";
};

const looksLikeAttributeName = (value) => /^[A-Z][A-Z0-9_]+$/.test(value);

const isArrayGroupName = (value) => {
  const normalized = normalizeSnakeCase(value);
  return ARRAY_GROUP_NAMES.some((name) => normalizeSnakeCase(name) === normalized);
};

const parseArrayFieldName = (value) => {
  const raw = safeString(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const match = lower.match(/(items|products|courses|line items|line_items|lineitems|cart_items|cartitems)[\[\]]*\.?\s*([a-z0-9 _-]+)/i);
  if (match && match[2]) {
    return normalizeSnakeCase(match[2]);
  }
  if (lower.includes("[].") || lower.includes("items.")) {
    const after = lower.split(".").slice(1).join(" ");
    return normalizeSnakeCase(after);
  }
  return "";
};

const rowHasContent = (row) => row && row.some((cell) => safeString(cell));

const findHeaderRow = (rows) => {
  let bestIndex = 0;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const labels = row.map(normalizeHeader).join(" ");
    let score = 0;
    if (labels.includes("event name")) score += 4;
    if (labels.includes("event")) score += 2;
    if (labels.includes("payload") || labels.includes("property") || labels.includes("parameter")) score += 2;
    if (labels.includes("type")) score += 1;
    if (labels.includes("description") || labels.includes("desc") || labels.includes("meaning")) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore > 0 ? bestIndex : 0;
};

const detectColumns = (headerRow) => {
  const headers = headerRow.map(normalizeHeader);
  const findExact = (labels) => headers.findIndex((label) => labels.includes(label));
  const findIndex = (keywords) =>
    headers.findIndex((label) => keywords.some((keyword) => label.includes(keyword)));

  let eventNameCol = findExact(["event name"]);
  if (eventNameCol < 0) eventNameCol = findIndex(["event name", "event"]);
  if (eventNameCol < 0) eventNameCol = 0;

  let payloadNameCol = findExact(["payload"]);
  if (payloadNameCol < 0) {
    payloadNameCol = findIndex(["payload name", "payload", "property", "parameter", "field", "parameter name"]);
  }
  if (payloadNameCol < 0 && eventNameCol === 0) payloadNameCol = 1;

  let dataTypeCol = findExact(["data type", "datatype"]);
  if (dataTypeCol < 0) dataTypeCol = findIndex(["data type", "datatype", "type"]);
  if (dataTypeCol < 0 && payloadNameCol >= 0) dataTypeCol = payloadNameCol + 1;

  let descriptionCol = findExact([
    "payload description",
    "payload desc",
    "payloaddescription",
    "payload details",
    "description",
  ]);
  if (descriptionCol < 0)
    descriptionCol = findIndex([
      "payload description",
      "description",
      "desc",
      "meaning",
      "definition",
      "notes",
      "details",
    ]);

  let useCaseCol = findExact(["use case", "use cases", "usecase", "usecases"]);
  if (useCaseCol < 0)
    useCaseCol = findIndex([
      "use case",
      "use cases",
      "usecase",
      "usecases",
      "usescase",
      "usescases",
      "use-case",
      "use-cases",
    ]);

  let attributeCol = findExact(["attribute", "attributes"]);
  if (attributeCol < 0) attributeCol = findIndex(["attribute", "profile attribute", "attributes"]);

  let arrayPayloadCol = findExact(["array payload"]);
  if (arrayPayloadCol < 0) {
    arrayPayloadCol = findIndex(["array payload", "array field", "array property", "array item", "array items"]);
  }
  let arrayDataTypeCol = findExact(["array data type", "array datatype"]);
  if (arrayDataTypeCol < 0) {
    arrayDataTypeCol = findIndex(["array data type", "array datatype", "array type"]);
  }
  let arrayDescriptionCol = findExact(["array description"]);
  if (arrayDescriptionCol < 0) {
    arrayDescriptionCol = findIndex(["array description", "array desc", "array meaning"]);
  }

  return {
    eventNameCol,
    payloadNameCol,
    dataTypeCol,
    descriptionCol,
    attributeCol,
    arrayPayloadCol,
    arrayDataTypeCol,
    arrayDescriptionCol,
    useCaseCol,
  };
};

const detectUploadedEventColumns = (headerRow) => {
  const headers = headerRow.map(normalizeHeader);
  const findIndex = (keywords) =>
    headers.findIndex((label) => keywords.some((keyword) => label.includes(keyword)));

  const eventNameCol = findIndex(["event name", "eventname", "event"]);
  const payloadNameCol = findIndex(["event payload", "eventpayload", "payload"]);
  const dataTypeCol = findIndex(["data type", "datatype", "type"]);
  const descriptionCol = headers.findIndex((label) => {
    if (!label) return false;
    const hasDesc = label.includes("description") || label.includes("desc");
    if (!hasDesc) return false;
    return !label.includes("event");
  });
  const eventDescriptionCol = findIndex([
    "event description",
    "eventdescription",
    "event desc",
    "event details",
  ]);
  const sampleValueCol = findIndex(["sample value", "samplevalue", "example", "sample"]);

  return {
    eventNameCol,
    payloadNameCol,
    dataTypeCol,
    descriptionCol,
    eventDescriptionCol,
    sampleValueCol,
  };
};

const createPayload = ({ name, dataType, description, inferredType, sampleValue }) => {
  const normalizedType = dataType || "text";
  const fallbackSample = sampleValueForEventType(normalizedType);
  return {
    id: uid("pl"),
    name,
    dataType: normalizedType,
    description: description || "",
    inferredType: Boolean(inferredType),
    sampleValue: safeString(sampleValue) || fallbackSample,
  };
};

const createEvent = ({ name, description, industry }) => ({
  id: uid("ev"),
  eventName: name || "",
  description: description || "",
  payloads: [],
  arrayPayload: null,
  selected: false,
  industry,
  arrayConflict: false,
});

const createAttribute = ({ name, dataType, description, inferredType, selected, sampleValue }) => {
  const normalizedType = dataType || "text";
  const fallbackSample = sampleValueForAttributeType(normalizedType);
  return {
    id: uid("attr"),
    name,
    dataType: normalizedType,
    description: description || "",
    inferredType: Boolean(inferredType),
    selected: Boolean(selected),
    sampleValue: safeString(sampleValue) || fallbackSample,
  };
};

const normalizePayloadShape = (payload) => {
  const dataType = payload?.dataType || "text";
  const fallbackSample = sampleValueForEventType(dataType);
  return {
    ...payload,
    dataType,
    description: payload?.description || "",
    inferredType: Boolean(payload?.inferredType),
    sampleValue: safeString(payload?.sampleValue) || fallbackSample,
  };
};

const normalizeEventShape = (event) => ({
  ...event,
  payloads: Array.isArray(event.payloads)
    ? event.payloads.map(normalizePayloadShape)
    : [],
  arrayPayload: event.arrayPayload
    ? {
        ...event.arrayPayload,
        name: event.arrayPayload.name || "items",
        fields: Array.isArray(event.arrayPayload.fields)
          ? event.arrayPayload.fields.map(normalizePayloadShape)
          : [],
      }
    : null,
  selected: Boolean(event.selected),
  arrayConflict: Boolean(event.arrayConflict),
});

const normalizeIndustryShape = (industry) => ({
  ...industry,
  events: Array.isArray(industry.events)
    ? industry.events.map(normalizeEventShape)
    : [],
});

const normalizeAttributeShape = (attribute) => {
  const dataType = attribute?.dataType || "text";
  const fallbackSample = sampleValueForAttributeType(dataType);
  return {
    ...attribute,
    dataType,
    description: attribute?.description || "",
    sampleValue: safeString(attribute?.sampleValue) || fallbackSample,
    selected: Boolean(attribute?.selected),
    inferredType: Boolean(attribute?.inferredType),
  };
};

const normalizeState = (industries, attributes) => ({
  industries: industries.map(normalizeIndustryShape),
  attributes: attributes.map(normalizeAttributeShape),
});

const sanitizeFileName = (value) =>
  safeString(value)
    .replace(/[<>:"/\\|?*]+/g, "")
    .trim()
    .replace(/\s+/g, "_");

const parseSheet = (sheetName, sheet) => {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const headerIndex = findHeaderRow(rows);
  const headerRow = rows[headerIndex] || [];
  let columns = detectColumns(headerRow);

  const events = [];
  const attributes = [];
  const attributeMap = new Map();

  let currentEvent = null;
  let inArray = false;

  const addAttribute = (rawName, rawType, rawDesc) => {
    const name = normalizeUpperSnakeCase(rawName);
    if (!name) return;
    if (attributeMap.has(name)) return;
    const normalizedType = normalizeDataType(rawType);
    const inferredType = !normalizedType;
    const attribute = createAttribute({
      name,
      dataType: normalizedType || "text",
      description: safeString(rawDesc),
      inferredType,
      selected: false,
    });
    attributeMap.set(name, attribute);
    attributes.push(attribute);
  };

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (!rowHasContent(row)) {
      inArray = false;
      continue;
    }

    const headerLabels = row.map(normalizeHeader);
    const headerSignature = headerLabels.join(" ");
    if (headerSignature.includes("event name") && headerSignature.includes("payload")) {
      columns = detectColumns(row);
      currentEvent = null;
      inArray = false;
      continue;
    }

    const rawEvent = safeString(row[columns.eventNameCol]);
    const rawPayload = columns.payloadNameCol >= 0 ? safeString(row[columns.payloadNameCol]) : "";
    const rawType = columns.dataTypeCol >= 0 ? safeString(row[columns.dataTypeCol]) : "";
    const rawDesc = columns.descriptionCol >= 0 ? safeString(row[columns.descriptionCol]) : "";
    const rawUseCase = columns.useCaseCol >= 0 ? safeString(row[columns.useCaseCol]) : "";
    const rawAttribute = columns.attributeCol >= 0 ? safeString(row[columns.attributeCol]) : "";
    const rawArrayPayload = columns.arrayPayloadCol >= 0 ? safeString(row[columns.arrayPayloadCol]) : "";
    const rawArrayType = columns.arrayDataTypeCol >= 0 ? safeString(row[columns.arrayDataTypeCol]) : "";
    const rawArrayDesc = columns.arrayDescriptionCol >= 0 ? safeString(row[columns.arrayDescriptionCol]) : "";

    if (rawAttribute) {
      addAttribute(rawAttribute, rawType, rawDesc);
      continue;
    }

    if (rawEvent) {
      const normalizedEventName = normalizeSnakeCase(rawEvent);
      currentEvent = createEvent({
        name: normalizedEventName,
        description: rawUseCase || "",
        industry: sheetName,
      });
      events.push(currentEvent);
      inArray = false;
    }

    if (!currentEvent) {
      const attributeCell = row.find((cell) => looksLikeAttributeName(safeString(cell)));
      if (attributeCell) {
        addAttribute(attributeCell, rawType, rawDesc);
      }
      continue;
    }

    if (!rawPayload && !rawArrayPayload) {
      if (rawUseCase) currentEvent.description = rawUseCase;
      if (columns.arrayPayloadCol >= 0) {
        inArray = false;
      }
      continue;
    }

    if (rawUseCase) {
      currentEvent.description = rawUseCase;
    }

    if (columns.arrayPayloadCol >= 0 && !rawArrayPayload) {
      inArray = false;
    }

    let handledArrayPayload = false;
    if (rawArrayPayload) {
      const normalizedHeader = normalizeHeader(rawArrayPayload);
      if (normalizedHeader.includes("array") && normalizedHeader.includes("payload")) {
        inArray = false;
        handledArrayPayload = true;
      } else {
        const arrayTypeValue = rawArrayType || rawType;
        const arrayDescValue = rawArrayDesc || rawDesc;
        const normalizedType = normalizeDataType(arrayTypeValue);
        const inferredType = !normalizedType;
        const arrayFieldName = parseArrayFieldName(rawArrayPayload);
        const normalizedArrayField = arrayFieldName || normalizeSnakeCase(rawArrayPayload);
        const payloadIsArrayHeader =
          isArrayGroupName(rawArrayPayload) &&
          (!normalizedType || arrayTypeValue.toLowerCase().includes("array"));

        if (payloadIsArrayHeader) {
          if (!currentEvent.arrayPayload) {
            currentEvent.arrayPayload = { name: "items", fields: [] };
          }
          inArray = true;
          handledArrayPayload = true;
        } else if (normalizedArrayField) {
          if (!currentEvent.arrayPayload) {
            currentEvent.arrayPayload = { name: "items", fields: [] };
          }
          currentEvent.arrayPayload.fields.push(
            createPayload({
              name: normalizedArrayField,
              dataType: normalizedType || "text",
              description: arrayDescValue,
              inferredType,
            })
          );
          inArray = true;
          handledArrayPayload = true;
        }
      }
    }

    if (!rawPayload) {
      if (handledArrayPayload) {
        continue;
      }
      continue;
    }

    const normalizedPayload = normalizeSnakeCase(rawPayload);
    if (!normalizedPayload) continue;

    const normalizedType = normalizeDataType(rawType);
    const inferredType = !normalizedType;
    const payload = createPayload({
      name: normalizedPayload,
      dataType: normalizedType || "text",
      description: rawDesc,
      inferredType,
    });

    const arrayFieldName = parseArrayFieldName(rawPayload);
    const payloadIsArrayHeader = isArrayGroupName(rawPayload) && (!normalizedType || rawType.toLowerCase().includes("array"));

    if (payloadIsArrayHeader) {
      if (!currentEvent.arrayPayload) {
        currentEvent.arrayPayload = { name: "items", fields: [] };
      } else {
        currentEvent.arrayConflict = true;
      }
      inArray = true;
      continue;
    }

    if (arrayFieldName) {
      if (!currentEvent.arrayPayload) {
        currentEvent.arrayPayload = { name: "items", fields: [] };
      }
      currentEvent.arrayPayload.fields.push({
        ...payload,
        name: arrayFieldName,
      });
      inArray = true;
      continue;
    }

    if (inArray) {
      if (!currentEvent.arrayPayload) {
        currentEvent.arrayPayload = { name: "items", fields: [] };
      }
      currentEvent.arrayPayload.fields.push(payload);
      continue;
    }

    currentEvent.payloads.push(payload);
  }

  return { events, attributes };
};

const parseUploadedEventWorkbook = (arrayBuffer, industryName) => {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { events: [], error: "Uploaded file has no sheets." };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const headerIndex = findHeaderRow(rows);
  const headerRow = rows[headerIndex] || [];
  let columns = detectUploadedEventColumns(headerRow);

  const missing = [];
  if (columns.eventNameCol < 0) missing.push("eventName");
  if (columns.payloadNameCol < 0) missing.push("eventPayload");
  if (columns.dataTypeCol < 0) missing.push("dataType");
  if (missing.length) {
    return {
      events: [],
      error: `Missing required columns: ${missing.join(", ")}.`,
    };
  }

  const events = [];
  let currentEvent = null;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (!rowHasContent(row)) continue;

    const headerSignature = row.map(normalizeHeader).join(" ");
    if (
      headerSignature.includes("event") &&
      headerSignature.includes("payload") &&
      headerSignature.includes("type")
    ) {
      columns = detectUploadedEventColumns(row);
      continue;
    }

    const rawEvent = safeString(row[columns.eventNameCol]);
    const rawPayload =
      columns.payloadNameCol >= 0 ? safeString(row[columns.payloadNameCol]) : "";
    const rawType = columns.dataTypeCol >= 0 ? safeString(row[columns.dataTypeCol]) : "";
    const rawDesc =
      columns.descriptionCol >= 0 ? safeString(row[columns.descriptionCol]) : "";
    const rawEventDesc =
      columns.eventDescriptionCol >= 0 ? safeString(row[columns.eventDescriptionCol]) : "";
    const rawSample =
      columns.sampleValueCol >= 0 ? safeString(row[columns.sampleValueCol]) : "";

    if (rawEvent) {
      const normalizedName = normalizeSnakeCase(rawEvent);
      if (normalizedName) {
        currentEvent = createEvent({
          name: normalizedName,
          description: rawEventDesc || "",
          industry: industryName,
        });
        events.push(currentEvent);
      } else {
        currentEvent = null;
      }
    }

    if (!currentEvent) continue;

    if (rawEventDesc && !currentEvent.description) {
      currentEvent.description = rawEventDesc;
    }

    if (!rawPayload) continue;

    const normalizedType = normalizeDataType(rawType);
    const payloadType = normalizedType || "text";
    const inferredType = !normalizedType;
    const arrayFieldName = parseArrayFieldName(rawPayload);
    const normalizedPayload = arrayFieldName || normalizeSnakeCase(rawPayload);
    if (!normalizedPayload) continue;

    const payload = createPayload({
      name: normalizedPayload,
      dataType: payloadType,
      description: rawDesc,
      inferredType,
      sampleValue: rawSample,
    });

    if (arrayFieldName) {
      if (!currentEvent.arrayPayload) {
        currentEvent.arrayPayload = { name: "items", fields: [] };
      }
      currentEvent.arrayPayload.fields.push(payload);
    } else {
      currentEvent.payloads.push(payload);
    }
  }

  if (events.length === 0) {
    return { events: [], error: "No events found in the uploaded sheet." };
  }

  return { events, error: "" };
};

const parseWorkbook = (arrayBuffer) => {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const industries = [];
  const attributeMap = new Map();

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const { events, attributes } = parseSheet(sheetName, sheet);

    industries.push({ name: sheetName, events });

    attributes.forEach((attribute) => {
      if (!attributeMap.has(attribute.name)) {
        attributeMap.set(attribute.name, attribute);
      }
    });
  });

  return { industries, attributes: Array.from(attributeMap.values()) };
};

const validateEvent = (event) => {
  const errors = [];
  const warnings = [];

  if (!event.eventName) {
    errors.push("Event name is required.");
  } else {
    if (!/^[a-z][a-z0-9_]*$/.test(event.eventName)) {
      errors.push("Event name must be lowercase snake_case.");
    }
    if (event.eventName.length > 50) {
      errors.push("Event name exceeds 50 characters.");
    }
  }

  const payloadCount = event.payloads.length + (event.arrayPayload ? event.arrayPayload.fields.length : 0);
  if (payloadCount > 100) {
    errors.push("Event exceeds 100 payloads including array fields.");
  }

  const payloadNameSet = new Set();
  event.payloads.forEach((payload) => {
    if (!payload.name) {
      errors.push("Payload name is required.");
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(payload.name)) {
      errors.push(`Payload "${payload.name}" must be lowercase snake_case.`);
    }
    if (payload.name.length > 120) {
      errors.push(`Payload "${payload.name}" exceeds 120 characters.`);
    }
    if (!DATA_TYPES.includes(payload.dataType)) {
      errors.push(`Payload "${payload.name}" has unsupported data type.`);
    }
    if (payload.inferredType) {
      warnings.push(`Payload "${payload.name}" defaulted to text.`);
    }
    if (payloadNameSet.has(payload.name)) {
      warnings.push(`Payload "${payload.name}" is duplicated.`);
    }
    payloadNameSet.add(payload.name);
  });

  if (event.arrayPayload) {
    const arrayFieldSet = new Set();
    if (event.arrayPayload.fields.length === 0) {
      warnings.push("Array payload exists but has no fields yet.");
    }
    event.arrayPayload.fields.forEach((payload) => {
      if (!payload.name) {
        errors.push("Array payload field name is required.");
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(payload.name)) {
        errors.push(`Array field "${payload.name}" must be lowercase snake_case.`);
      }
      if (payload.name.length > 120) {
        errors.push(`Array field "${payload.name}" exceeds 120 characters.`);
      }
      if (!DATA_TYPES.includes(payload.dataType)) {
        errors.push(`Array field "${payload.name}" has unsupported data type.`);
      }
      if (payload.inferredType) {
        warnings.push(`Array field "${payload.name}" defaulted to text.`);
      }
      if (arrayFieldSet.has(payload.name)) {
        warnings.push(`Array field "${payload.name}" is duplicated.`);
      }
      arrayFieldSet.add(payload.name);
    });
  }

  if (event.arrayConflict) {
    errors.push("Multiple array payload groups detected. Only one is allowed.");
  }

  const allPayloadNames = new Set([
    ...event.payloads.map((payload) => payload.name),
    ...(event.arrayPayload ? event.arrayPayload.fields.map((payload) => payload.name) : []),
  ]);

  const nameLower = event.eventName || "";
  if (nameLower.includes("revenue") && nameLower.includes("dashboard")) {
    if (!allPayloadNames.has("revenue") && !allPayloadNames.has("amount")) {
      errors.push("Revenue dashboard events must include revenue or amount payloads.");
    }
  }

  if (nameLower.includes("rfm")) {
    if (!allPayloadNames.has("amount")) {
      errors.push("RFM events require an amount payload.");
    }
  }

  if (nameLower.includes("product_collection") || (nameLower.includes("product") && nameLower.includes("collection"))) {
    if (!event.arrayPayload) {
      errors.push("Product collection events must include an array payload.");
    } else {
      ["prid", "prqt", "image"].forEach((field) => {
        if (!event.arrayPayload.fields.find((payload) => payload.name === field)) {
          errors.push(`Product collection arrays must include ${field}.`);
        }
      });
    }
  }

  if (!event.description) {
    warnings.push("Add a short description to help non-technical users.");
  }

  return { errors, warnings };
};

const validateAttribute = (attribute) => {
  const errors = [];
  const warnings = [];

  if (!attribute.name) {
    errors.push("Attribute name is required.");
  } else if (!/^[A-Z][A-Z0-9_]*$/.test(attribute.name)) {
    errors.push("Attribute name must be UPPER_CASE_SNAKE_CASE.");
  }

  if (!DATA_TYPES.includes(attribute.dataType)) {
    errors.push("Attribute data type must be text, integer, float, or date.");
  }

  if (attribute.inferredType) {
    warnings.push("Attribute defaulted to text.");
  }

  if (!attribute.description) {
    warnings.push("Consider adding a description for clarity.");
  }

  return { errors, warnings };
};

const formatIndustryLabel = (name) => name.replace(/[_-]+/g, " ");

const buildUniqueIndustryName = (baseName, existingNames) => {
  const normalized = normalizeSnakeCase(baseName) || "uploaded_events";
  if (!existingNames.includes(normalized)) return normalized;
  let counter = 2;
  let candidate = `${normalized}_${counter}`;
  while (existingNames.includes(candidate)) {
    counter += 1;
    candidate = `${normalized}_${counter}`;
  }
  return candidate;
};

const sampleValueForEventType = (dataType) => {
  switch ((dataType || "").toLowerCase()) {
    case "text":
      return "\"hello\"";
    case "integer":
      return "12";
    case "float":
      return "12.1";
    case "date":
      return "\"2025-12-12 11:11:25\"";
    default:
      return "";
  }
};

const sampleValueForAttributeType = (dataType) => {
  switch ((dataType || "").toLowerCase()) {
    case "text":
      return "\"hello\"";
    case "integer":
      return "12";
    case "float":
      return "12.1";
    case "date":
      return "\"2025-12-12\"";
    default:
      return "";
  }
};

const shouldResetSampleValue = (currentSample, previousType, isAttribute = false) => {
  const current = safeString(currentSample);
  if (!current) return true;
  const fallback = isAttribute
    ? sampleValueForAttributeType(previousType)
    : sampleValueForEventType(previousType);
  return current === fallback;
};

const buildExportRows = (events, attributes) => {
  const eventRows = [
    ["eventName", "eventPayload", "dataType", "sampleValue", "description", "eventDescription"],
  ];
  events.forEach((event) => {
    const payloads = [
      ...event.payloads.map((payload) => ({
        name: payload.name,
        dataType: payload.dataType,
        description: payload.description,
        sampleValue: payload.sampleValue,
      })),
      ...(event.arrayPayload
        ? event.arrayPayload.fields.map((payload) => ({
            name: `items[].${payload.name}`,
            dataType: payload.dataType,
            description: payload.description,
            sampleValue: payload.sampleValue,
          }))
        : []),
    ];

    if (payloads.length === 0) {
      eventRows.push([event.eventName, "", "", "", "", event.description || ""]);
      return;
    }

    payloads.forEach((payload, index) => {
      eventRows.push([
        index === 0 ? event.eventName : "",
        payload.name,
        payload.dataType,
        safeString(payload.sampleValue) || sampleValueForEventType(payload.dataType),
        payload.description || "",
        index === 0 ? event.description || "" : "",
      ]);
    });
  });

  const attributeRows = [
    ["ATTRIBUTE", "DATATYPE", "SAMPLE_VALUE", "DESCRIPTION"],
    ...attributes.map((attribute) => [
      attribute.name,
      attribute.dataType,
      safeString(attribute.sampleValue) || sampleValueForAttributeType(attribute.dataType),
      attribute.description || "",
    ]),
  ];

  const ruleRows = [
    [],
    ["", "", "", "", "", "RULES"],
    ["", "", "", "", "", "Events and payloads must be lowercase snake_case."],
    ["", "", "", "", "", "No nested arrays or nested objects."],
    ["", "", "", "", "", "Only one array payload items[] per event (array of objects only)."],
    [
      "",
      "",
      "",
      "",
      "",
      'Event data types: date ("2025-12-12 11:11:25"), text ("hello"), integer (12), float (12.1).',
    ],
    ["", "", "", "", "", "Attribute names must be UPPER_CASE_SNAKE_CASE."],
    [
      "",
      "",
      "",
      "",
      "",
      'Attribute data types: date ("2025-12-12"), text ("hello"), integer (12), float (12.1).',
    ],
  ];

  return { eventRows: [...eventRows, ...ruleRows], attributeRows };
};

const XLSX_STYLES = {
  eventName: { fill: { patternType: "solid", fgColor: { rgb: "#6fe36d" } } },
  eventPayload: { fill: { patternType: "solid", fgColor: { rgb: "#80c2ed" } } },
  dataType: {
    date: { fill: { patternType: "solid", fgColor: { rgb: "#e6f7a1" } } },
    float: { fill: { patternType: "solid", fgColor: { rgb: "#dbbf86" } } },
    integer: { fill: { patternType: "solid", fgColor: { rgb: "#f3c6f5" } } },
    text: { fill: { patternType: "solid", fgColor: { rgb: "#f27e99" } } },
  },
};

const XLSX_STYLE_URLS = [
  "https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.full.min.js",
];

let xlsxLoadPromise = null;
const ensureXLSX = () => {
  if (window.XLSX) {
    window.__XLSX_STYLE_READY = true;
    return Promise.resolve(window.XLSX);
  }
  if (xlsxLoadPromise) return xlsxLoadPromise;

  xlsxLoadPromise = new Promise((resolve, reject) => {
    const tryLoad = (index) => {
      if (index >= XLSX_STYLE_URLS.length) {
        reject(new Error("XLSX library not loaded"));
        return;
      }
      const script = document.createElement("script");
      script.src = XLSX_STYLE_URLS[index];
      script.async = true;
      script.onload = () => {
        if (window.XLSX) {
          window.__XLSX_STYLE_READY = true;
          resolve(window.XLSX);
        } else {
          script.remove();
          tryLoad(index + 1);
        }
      };
      script.onerror = () => {
        script.remove();
        tryLoad(index + 1);
      };
      document.head.appendChild(script);
    };
    tryLoad(0);
  });

  return xlsxLoadPromise;
};

const applyEventSheetStyles = (worksheet, eventRows) => {
  if (!worksheet || !worksheet["!ref"]) return;
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  for (let r = 1; r <= range.e.r; r += 1) {
    const eventNameCell = XLSX.utils.encode_cell({ r, c: 0 });
    const payloadCell = XLSX.utils.encode_cell({ r, c: 1 });
    const dataTypeCell = XLSX.utils.encode_cell({ r, c: 2 });

    if (worksheet[eventNameCell]?.v) {
      worksheet[eventNameCell].s = XLSX_STYLES.eventName;
    }
    if (worksheet[payloadCell]?.v) {
      worksheet[payloadCell].s = XLSX_STYLES.eventPayload;
    }
    if (worksheet[dataTypeCell]?.v) {
      const typeValue = String(worksheet[dataTypeCell].v).toLowerCase();
      if (XLSX_STYLES.dataType[typeValue]) {
        worksheet[dataTypeCell].s = XLSX_STYLES.dataType[typeValue];
      }
    }
  }
};

const App = () => {
  const [loading, setLoading] = useState(true);
  const [industries, setIndustries] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [view, setView] = useState("library");
  const [editingEvent, setEditingEvent] = useState(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [lastSelected, setLastSelected] = useState({ industry: "", index: null });
  const defaultExportName = useMemo(
    () => `CE_Event_Library_${new Date().toISOString().slice(0, 10)}`,
    []
  );
  const [exportName, setExportName] = useState(defaultExportName);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("uploaded_events");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadFromWorkbook = async () => {
    setLoading(true);
    setError("");
    try {
      let response = await fetch("./event_library_new.xlsx");
      if (!response.ok) {
        response = await fetch("./event_library_new_3.xlsx");
      }
      if (!response.ok) {
        response = await fetch("./Event_library.xlsx");
      }
      if (!response.ok) {
        throw new Error("Unable to load event library.");
      }
      const arrayBuffer = await response.arrayBuffer();
      const { industries: parsedIndustries, attributes: parsedAttributes } =
        parseWorkbook(arrayBuffer);
      const normalized = normalizeState(parsedIndustries, parsedAttributes);
      setIndustries(normalized.industries);
      setAttributes(normalized.attributes);
      setSelectedIndustry(normalized.industries[0]?.name || "");
      setLoading(false);
      setHydrated(true);
    } catch (err) {
      setError(err.message || "Unable to load the Excel source.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.industries?.length) {
          const normalized = normalizeState(parsed.industries, parsed.attributes || []);
          setIndustries(normalized.industries);
          setAttributes(normalized.attributes);
          setSelectedIndustry(parsed.selectedIndustry || normalized.industries[0]?.name || "");
          setView(parsed.view || "library");
          setExportName(parsed.exportName || defaultExportName);
          setExportFormat(parsed.exportFormat || "xlsx");
          setLoading(false);
          setHydrated(true);
          return;
        }
      } catch (err) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    loadFromWorkbook();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload = {
      industries,
      attributes,
      selectedIndustry,
      view,
      exportName,
      exportFormat,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [industries, attributes, selectedIndustry, view, exportName, exportFormat, hydrated]);

  const currentIndustry = industries.find((industry) => industry.name === selectedIndustry);

  const selectedEvents = useMemo(
    () =>
      industries.flatMap((industry) => industry.events.filter((event) => event.selected)),
    [industries]
  );

  const selectedAttributes = useMemo(
    () => attributes.filter((attribute) => attribute.selected),
    [attributes]
  );

  const uploadResolvedName = buildUniqueIndustryName(
    uploadName,
    industries.map((industry) => industry.name)
  );

  const exportValidation = useMemo(() => {
    const errors = [];
    const warnings = [];

    if (selectedEvents.length === 0) {
      errors.push({ message: "Select at least one event to export." });
    }

    selectedEvents.forEach((event) => {
      const issues = validateEvent(event);
      issues.errors.forEach((message) => errors.push({ message, event: event.eventName }));
      issues.warnings.forEach((message) => warnings.push({ message, event: event.eventName }));
    });

    selectedAttributes.forEach((attribute) => {
      const issues = validateAttribute(attribute);
      issues.errors.forEach((message) => errors.push({ message, attribute: attribute.name }));
      issues.warnings.forEach((message) => warnings.push({ message, attribute: attribute.name }));
    });

    return { errors, warnings };
  }, [selectedEvents, selectedAttributes]);

  const canExport = exportValidation.errors.length === 0;

  const updateEvent = (industryName, eventId, updater) => {
    setIndustries((prev) =>
      prev.map((industry) => {
        if (industry.name !== industryName) return industry;
        return {
          ...industry,
          events: industry.events.map((event) =>
            event.id === eventId ? updater(event) : event
          ),
        };
      })
    );
  };

  const handleToggleSelect = (industryName, eventId, index, useRange) => {
    setIndustries((prev) =>
      prev.map((industry) => {
        if (industry.name !== industryName) return industry;
        if (
          useRange &&
          lastSelected.industry === industryName &&
          lastSelected.index !== null &&
          index !== null
        ) {
          const start = Math.min(lastSelected.index, index);
          const end = Math.max(lastSelected.index, index);
          return {
            ...industry,
            events: industry.events.map((event, idx) =>
              idx >= start && idx <= end ? { ...event, selected: true } : event
            ),
          };
        }
        return {
          ...industry,
          events: industry.events.map((event) =>
            event.id === eventId ? { ...event, selected: !event.selected } : event
          ),
        };
      })
    );
    setLastSelected({ industry: industryName, index });
  };

const handleSaveDrafts = (industryName, drafts) => {
  if (!drafts.length) {
    setEditingEvent(null);
    return;
  }

  const [firstDraft, ...restDrafts] = drafts;

  // update the existing event with the first draft
  updateEvent(industryName, firstDraft.id, () => ({ ...firstDraft, selected: true }));

  // append additional drafts as new events
  if (restDrafts.length) {
    setIndustries((prev) =>
      prev.map((industry) => {
        if (industry.name !== industryName) return industry;
        return {
          ...industry,
          events: [
            ...restDrafts.map((draft) => ({
              ...draft,
              id: uid("ev"),
              selected: true,
            })),
            ...industry.events,
          ],
        };
      })
    );
  }

  setEditingEvent(null);
};

const handleAddEvent = () => {
  if (!selectedIndustry) return;
  const newEvent = createEvent({ name: "", description: "", industry: selectedIndustry });
  setIndustries((prev) =>
    prev.map((industry) =>
      industry.name === selectedIndustry
        ? { ...industry, events: [newEvent, ...industry.events] }
        : industry
    )
  );
  setEditingEvent({ industry: selectedIndustry, eventId: newEvent.id, isNew: true });
};

  const handleExportXlsx = async () => {
    const { eventRows, attributeRows } = buildExportRows(selectedEvents, selectedAttributes);
    let XLSX;
    try {
      XLSX = await ensureXLSX();
    } catch (err) {
      alert("XLSX library not loaded. Use a local server (not file://) or allow CDN access.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const wsEvents = XLSX.utils.aoa_to_sheet(eventRows);
    const wsAttributes = XLSX.utils.aoa_to_sheet(attributeRows);

    if (!window.__XLSX_STYLE_READY) {
      alert("Styled export requires xlsx-js-style. Exporting without styles.");
    } else {
      applyEventSheetStyles(wsEvents, eventRows);
    }

    XLSX.utils.book_append_sheet(wb, wsEvents, "Events");
    XLSX.utils.book_append_sheet(wb, wsAttributes, "Attributes");

    const safeBaseName = sanitizeFileName(exportName) || defaultExportName;
    const base = safeBaseName.toLowerCase().endsWith(".xlsx")
      ? safeBaseName.replace(/\.xlsx$/i, "")
      : safeBaseName;
    XLSX.writeFile(wb, `${base}_styled.xlsx`);
  };

  const handleExportCsv = async () => {
    const { eventRows, attributeRows } = buildExportRows(selectedEvents, selectedAttributes);
    let XLSX;
    try {
      XLSX = await ensureXLSX();
    } catch (err) {
      alert("XLSX library not loaded. Use a local server (not file://) or allow CDN access.");
      return;
    }

    const wsEvents = XLSX.utils.aoa_to_sheet(eventRows);
    const wsAttributes = XLSX.utils.aoa_to_sheet(attributeRows);
    const eventsCsv = XLSX.utils.sheet_to_csv(wsEvents);
    const attributesCsv = XLSX.utils.sheet_to_csv(wsAttributes);

    const safeBaseName = sanitizeFileName(exportName) || defaultExportName;
    const base = safeBaseName.toLowerCase().endsWith(".csv")
      ? safeBaseName.replace(/\.csv$/i, "")
      : safeBaseName;

    const downloadBlob = (content, filename) => {
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    downloadBlob(eventsCsv, `${base}_events.csv`);
    downloadBlob(attributesCsv, `${base}_attributes.csv`);
  };

  const handleExport = () => {
    if (exportFormat === "csv") {
      handleExportCsv();
      return;
    }
    handleExportXlsx();
  };

  const handleDownloadSampleSheet = async () => {
    let XLSX;
    try {
      XLSX = await ensureXLSX();
    } catch (err) {
      alert("XLSX library not loaded. Use a local server (not file://) or allow CDN access.");
      return;
    }
    const sampleRows = [
      ["eventName", "eventPayload", "dataType", "sampleValue", "description", "eventDescription"],
      [
        "registration",
        "source",
        "text",
        "\"hello\"",
        "web or app",
        "Call when a new user registers",
      ],
      ["", "method", "text", "\"hello\"", "Social, email, phone", ""],
      [
        "product_collection",
        "items[].prid",
        "text",
        "\"hello\"",
        "product id",
        "Collects products in cart",
      ],
      ["", "items[].prqt", "integer", "12", "quantity", ""],
      ["", "items[].price", "float", "12.1", "price", ""],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    XLSX.utils.book_append_sheet(wb, ws, "Events");
    XLSX.writeFile(wb, "sample_event_sheet.xlsx");
  };

  const handleUploadOpen = () => {
    setUploadName("uploaded_events");
    setUploadFile(null);
    setUploadError("");
    setUploadOpen(true);
  };

  const handleUploadEvents = async () => {
    if (!uploadFile) {
      setUploadError("Select a CSV or XLSX file to upload.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      await ensureXLSX();
      const arrayBuffer = await uploadFile.arrayBuffer();
      const existingNames = industries.map((industry) => industry.name);
      const resolvedName = buildUniqueIndustryName(uploadName, existingNames);
      const { events, error: uploadParseError } = parseUploadedEventWorkbook(
        arrayBuffer,
        resolvedName
      );

      if (uploadParseError) {
        setUploadError(uploadParseError);
        return;
      }

      setIndustries((prev) => [
        {
          name: resolvedName,
          events,
        },
        ...prev,
      ]);
      setSelectedIndustry(resolvedName);
      setView("library");
      setUploadOpen(false);
    } catch (err) {
      setUploadError(err.message || "Unable to read the uploaded file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleReload = () => {
    localStorage.removeItem(STORAGE_KEY);
    loadFromWorkbook();
  };

  const updateAttribute = (attributeId, updater) => {
    setAttributes((prev) => prev.map((attr) => (attr.id === attributeId ? updater(attr) : attr)));
  };

  const addAttribute = () => {
    setAttributes((prev) => [
      createAttribute({ name: "", dataType: "text", description: "", selected: true }),
      ...prev,
    ]);
  };

  const removeAttribute = (attributeId) => {
    setAttributes((prev) => prev.filter((attr) => attr.id !== attributeId));
  };

  const toggleAttributeSelected = (attributeId) => {
    updateAttribute(attributeId, (attr) => ({ ...attr, selected: !attr.selected }));
  };

  const selectAllAttributes = () => {
    setAttributes((prev) => prev.map((attr) => ({ ...attr, selected: true })));
  };

  const clearAllAttributes = () => {
    setAttributes((prev) => prev.map((attr) => ({ ...attr, selected: false })));
  };

  const deselectEvent = (eventToRemove) => {
    if (!eventToRemove) return;
    updateEvent(eventToRemove.industry, eventToRemove.id, (event) => ({
      ...event,
      selected: false,
    }));
  };

  const deleteEvent = (industryName, eventId) => {
    setIndustries((prev) =>
      prev.map((industry) =>
        industry.name === industryName
          ? { ...industry, events: industry.events.filter((evt) => evt.id !== eventId) }
          : industry
      )
    );
    if (editingEvent && editingEvent.eventId === eventId) {
      setEditingEvent(null);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="title-block">
            <h1>Netcore Event Library Builder</h1>
            <p>Loading and normalizing your Excel library.</p>
          </div>
        </header>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="title-block">
            <h1>Netcore Event Library Builder</h1>
            <p>We hit a problem loading the Excel source.</p>
          </div>
        </header>
        <div style={{ padding: "0 36px" }}>
          <div className="empty-state">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
            <h1>Netcore Event Library Builder</h1>
          <p>
            Clean, normalize, and export CE-safe events from a bundled Excel library.
          </p>
        </div>
        <div className="action-row">
          <div className="file-input">
            <label htmlFor="export-name">File name</label>
            <input
              id="export-name"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              onBlur={(e) => setExportName(sanitizeFileName(e.target.value) || defaultExportName)}
              placeholder="CE_Event_Library_YYYY-MM-DD"
            />
          </div>
          <div className="file-input">
            <label>Export as</label>
            <div className="toggle-group" role="group" aria-label="Export format">
              <button
                type="button"
                className={`toggle ${exportFormat === "xlsx" ? "active" : ""}`}
                aria-pressed={exportFormat === "xlsx"}
                onClick={() => setExportFormat("xlsx")}
              >
                XLSX (styled)
              </button>
              <button
                type="button"
                className={`toggle ${exportFormat === "csv" ? "active" : ""}`}
                aria-pressed={exportFormat === "csv"}
                onClick={() => setExportFormat("csv")}
              >
                CSV
              </button>
            </div>
          </div>
          <button className="ghost" onClick={handleReload}>
            Reload Source
          </button>
          <button className="ghost" onClick={handleUploadOpen}>
            Upload Event Sheet
          </button>
          <button className="ghost" onClick={() => setPreviewOpen(true)}>
            Preview Export
          </button>
          <button className="ghost" onClick={() => setShowRules((v) => !v)}>
            {showRules ? "Hide Rules" : "Show Rules"}
          </button>
          <button className="primary" onClick={handleExport} disabled={!canExport}>
            Export
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="panel">
            <h3>Industries</h3>
            <div className="industry-list">
              {industries.map((industry) => (
                <button
                  key={industry.name}
                  className={`industry-button ${
                    selectedIndustry === industry.name ? "active" : ""
                  }`}
                  onClick={() => {
                    setSelectedIndustry(industry.name);
                  }}
                >
                  {formatIndustryLabel(industry.name)}
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3>Workspace</h3>
            <button
              className={`nav-button ${view === "library" ? "active" : ""}`}
              onClick={() => setView("library")}
            >
              Event Library
            </button>
            <button
              className={`nav-button ${view === "attributes" ? "active" : ""}`}
              onClick={() => setView("attributes")}
            >
              Attributes Manager
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="section-header">
            <div>
              <h2>
                {view === "attributes"
                  ? "Attributes"
                  : formatIndustryLabel(selectedIndustry) || "Event Library"}
              </h2>
              <p>
                {view === "attributes"
                  ? "Attributes live outside events. Keep them in UPPER_CASE_SNAKE_CASE."
                  : "Select, review, and edit events before export."}
              </p>
            </div>
            {view === "library" && (
              <div className="toolbar">
                <button className="secondary" onClick={handleAddEvent}>
                  Add Custom Event
                </button>
              </div>
            )}
          </div>

          <div className="summary-bar">
            <div className="summary-chip">
              Selected events: {selectedEvents.length}
            </div>
            <div className="summary-chip">
              Selected attributes: {selectedAttributes.length}
            </div>
            {/* <div //commented
              className={`summary-chip ${
                exportValidation.errors.length ? "error" : ""
              }`}
            >
              Export-blocking issues: {exportValidation.errors.length}
            </div>
            <div
              className={`summary-chip ${
                exportValidation.warnings.length ? "warning" : ""
              }`}
            >
              Warnings: {exportValidation.warnings.length}
            </div> */}
          </div>

          {showRules && (
          <RulesOverlay onClose={() => setShowRules(false)}>
            <RulesPanel onClose={() => setShowRules(false)} />
          </RulesOverlay>
        )}

          {view === "library" ? (
            <>
              {currentIndustry ? (
                <div className="event-grid">
                  {currentIndustry.events.map((event, index) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      industryName={currentIndustry.name}
                      index={index}
                      onEdit={() =>
                        setEditingEvent({ industry: currentIndustry.name, eventId: event.id })
                      }
                      onToggleSelect={(e) =>
                        handleToggleSelect(
                          currentIndustry.name,
                          event.id,
                          index,
                          e.shiftKey
                        )
                      }
                      onDelete={() => deleteEvent(currentIndustry.name, event.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">No industries detected in the Excel file.</div>
              )}
            </>
          ) : (
            <AttributesManager
              attributes={attributes}
              onAdd={addAttribute}
              onUpdate={updateAttribute}
              onRemove={removeAttribute}
              onToggleSelect={toggleAttributeSelected}
              onSelectAll={selectAllAttributes}
              onClearAll={clearAllAttributes}
            />
          )}

        </main>
      </div>

      {editingEvent && (
        <EventEditor
          event={
            industries
              .find((industry) => industry.name === editingEvent.industry)
              ?.events.find((evt) => evt.id === editingEvent.eventId) || null
          }
          industryName={editingEvent.industry}
          isNew={Boolean(editingEvent.isNew)}
          onClose={(shouldRemoveNew) => {
            if (shouldRemoveNew && editingEvent.isNew) {
              setIndustries((prev) =>
                prev.map((industry) =>
                  industry.name === editingEvent.industry
                    ? {
                        ...industry,
                        events: industry.events.filter((evt) => evt.id !== editingEvent.eventId),
                      }
                    : industry
                )
              );
            }
            setEditingEvent(null);
          }}
          onSaveAll={(drafts) => handleSaveDrafts(editingEvent.industry, drafts)}
        />
      )}

      {previewOpen && (
        <ExportPreview
          events={selectedEvents}
          attributes={selectedAttributes}
          onRemoveEvent={deselectEvent}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {uploadOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Upload Event Sheet</h2>
              <button className="ghost" onClick={() => setUploadOpen(false)}>
                Close
              </button>
            </div>
            <div className="modal-section">
              <label className="inline-note">New Industry Name</label>
              <input
                className="input"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="uploaded_events"
              />
              <div className="inline-note">Will be saved as: {uploadResolvedName}</div>

              <label className="inline-note" style={{ marginTop: "12px" }}>
                Event sheet (.xlsx or .csv)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <div className="inline-note">
                Required columns: eventName, eventPayload, dataType. Optional: description,
                eventDescription, sampleValue.
              </div>
              {uploadError && (
                <div className="inline-note" style={{ color: "var(--error)" }}>
                  {uploadError}
                </div>
              )}
              <div className="action-row" style={{ marginTop: "16px" }}>
                <button className="ghost" onClick={handleDownloadSampleSheet}>
                  Download Sample Sheet
                </button>
                <button
                  className="primary"
                  onClick={handleUploadEvents}
                  disabled={uploading}
                >
                  {uploading ? "Importing..." : "Import Events"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EventCard = ({ event, industryName, onEdit, onToggleSelect, onDelete }) => {
  const [preview, setPreview] = useState(false);
  const { errors, warnings } = validateEvent(event);

  return (
    <div className={`event-card ${event.selected ? "selected" : ""}`}>
      <h3>{event.eventName || "Untitled event"}</h3>
      <p>{event.description || "Add a short description for clarity."}</p>
      <div className="event-meta">
        <span className="meta-pill">Payloads: {event.payloads.length}</span>
        <span className="meta-pill">
          Array fields: {event.arrayPayload ? event.arrayPayload.fields.length : 0}
        </span>
        {event.selected && <span className="badge success">Selected</span>}
        {/* {errors.length > 0 && ( //commented
          <span className="badge error">{errors.length} errors</span>
        )}
        {warnings.length > 0 && (
          <span className="badge warning">{warnings.length} warnings</span>
        )} */}
      </div>
      <div className="event-actions">
        <button className="secondary" onClick={onEdit}>
          Edit Event
        </button>
        <button className="ghost" onClick={() => setPreview((prev) => !prev)}>
          {preview ? "Hide Payloads" : "Preview Payloads"}
        </button>
        <button className="primary" onClick={onToggleSelect}>
          {event.selected ? "Selected" : "Use This Event"}
        </button>
        <button className="ghost" onClick={onDelete}>
          Delete
        </button>
      </div>
      {preview && (
        <div className="payload-preview">
          <div>Payloads</div>
          <ul>
            {event.payloads.map((payload) => (
              <li key={payload.id}>
                {payload.name} ({payload.dataType})
              </li>
            ))}
            {event.arrayPayload && (
              <li>
                items[]
                <ul>
                  {event.arrayPayload.fields.map((payload) => (
                    <li key={payload.id}>
                      {payload.name} ({payload.dataType})
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

const EventEditor = ({ event, industryName, isNew, onClose, onSaveAll }) => {
  if (!event) return null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const [drafts, setDrafts] = useState(() => [clone(event)]);
  const [expanded, setExpanded] = useState(() => [true]);
  const [attemptedSave, setAttemptedSave] = useState(false);

  useEffect(() => {
    if (event) {
      setDrafts([clone(event)]);
      setExpanded([true]);
    }
  }, [event]);

  const addDraft = () => {
    const newDraft = createEvent({ name: "", description: "", industry: industryName });
    setDrafts((prev) => [...prev, newDraft]);
    setExpanded((prev) => [...prev, true]);
  };

  const removeDraft = (index) => {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, idx) => idx !== index));
    setExpanded((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateDraft = (index, updater) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === index ? updater({ ...d }) : d)));

  const toggleExpanded = (index) =>
    setExpanded((prev) => prev.map((val, idx) => (idx === index ? !val : val)));

  const handleSaveAll = () => onSaveAll(drafts);
  const allNamed = drafts.every((d) => d.eventName && d.eventName.trim().length > 0);
  const lastNamed = drafts[drafts.length - 1]?.eventName?.trim().length > 0;

  const handleSaveClick = () => {
    if (!allNamed) {
      setAttemptedSave(true);
      return;
    }
    onSaveAll(drafts);
  };

  const makePayloadUpdater = (idx) => (payloadId, updater) =>
    updateDraft(idx, (current) => ({
      ...current,
      payloads: current.payloads.map((payload) =>
        payload.id === payloadId ? updater({ ...payload }) : payload
      ),
    }));

  const makeArrayUpdater = (idx) => (payloadId, updater) =>
    updateDraft(idx, (current) => {
      if (!current.arrayPayload) return current;
      return {
        ...current,
        arrayPayload: {
          ...current.arrayPayload,
          fields: current.arrayPayload.fields.map((payload) =>
            payload.id === payloadId ? updater({ ...payload }) : payload
          ),
        },
      };
    });

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>Bulk Add Events</h2>
          <div className="action-row">
            <button className="ghost" onClick={() => onClose(isNew)}>
              Cancel
            </button>
            <button className="secondary" onClick={addDraft} disabled={!lastNamed}>
              + Add Another Event
            </button>
            <button className="primary" onClick={handleSaveClick} disabled={!allNamed}>
              Save All
            </button>
          </div>
        </div>

        {drafts.map((draft, idx) => {
          const { errors, warnings } = validateEvent(draft);
          const showNameError = attemptedSave && (!draft.eventName || !draft.eventName.trim());
          const updatePayload = makePayloadUpdater(idx);
          const updateArrayField = makeArrayUpdater(idx);

          const addPayload = () => {
            updateDraft(idx, (current) => ({
              ...current,
              payloads: [
                ...current.payloads,
                createPayload({ name: "", dataType: "text", description: "" }),
              ],
            }));
          };

          const addArrayField = () => {
            updateDraft(idx, (current) => {
              const arrayPayload = current.arrayPayload || { name: "items", fields: [] };
              return {
                ...current,
                arrayPayload: {
                  ...arrayPayload,
                  fields: [
                    ...arrayPayload.fields,
                    createPayload({ name: "", dataType: "text", description: "" }),
                  ],
                },
              };
            });
          };

          const removePayload = (payloadId) => {
            updateDraft(idx, (current) => ({
              ...current,
              payloads: current.payloads.filter((payload) => payload.id !== payloadId),
            }));
          };

          const removeArrayField = (payloadId) => {
            updateDraft(idx, (current) => {
              if (!current.arrayPayload) return current;
              return {
                ...current,
                arrayPayload: {
                  ...current.arrayPayload,
                  fields: current.arrayPayload.fields.filter((payload) => payload.id !== payloadId),
                },
              };
            });
          };

          const toggleArray = () => {
            updateDraft(idx, (current) => ({
              ...current,
              arrayPayload: current.arrayPayload ? null : { name: "items", fields: [] },
            }));
          };

          return (
            <div key={idx} className="modal-section">
              <div className="section-toggle">
                <h4>
                  Event {idx + 1} {draft.eventName ? `· ${draft.eventName}` : ""}
                </h4>
                <div className="action-row">
                  {drafts.length > 1 && (
                    <button className="ghost" onClick={() => removeDraft(idx)}>
                      Remove
                    </button>
                  )}
                  <button className="ghost" onClick={() => toggleExpanded(idx)}>
                    {expanded[idx] ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {expanded[idx] ? (
                <>
                  <label className="inline-note">Event name (lowercase snake_case, max 50)</label>
                  <input
                    className="input"
                    value={draft.eventName}
                    onChange={(e) =>
                      updateDraft(idx, (current) => ({ ...current, eventName: e.target.value }))
                    }
                    onBlur={(e) =>
                      updateDraft(idx, (current) => ({
                        ...current,
                        eventName: normalizeSnakeCase(e.target.value),
                      }))
                    }
                    placeholder="screen_load"
                  />
                  {showNameError && (
                    <div className="inline-note" style={{ color: "var(--error)" }}>
                      Event name is required before saving.
                    </div>
                  )}
                  <label className="inline-note">Event Description</label>
                  <textarea
                    className="textarea"
                    value={draft.description}
                    onChange={(e) =>
                      updateDraft(idx, (current) => ({ ...current, description: e.target.value }))
                    }
                    placeholder="Explain when this event fires."
                  />

                  <h4>Payloads</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Payload Name</th>
                        <th>Data Type</th>
                        <th>Sample Value</th>
                        <th>Description</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.payloads.map((payload) => (
                        <tr key={payload.id}>
                          <td>
                            <input
                              value={payload.name}
                              onChange={(e) =>
                                updatePayload(payload.id, (item) => ({
                                  ...item,
                                  name: e.target.value,
                                  inferredType: false,
                                }))
                              }
                              onBlur={(e) =>
                                updatePayload(payload.id, (item) => ({
                                  ...item,
                                  name: normalizeSnakeCase(e.target.value),
                                }))
                              }
                              placeholder="page_title"
                            />
                          </td>
                          <td>
                            <select
                              value={payload.dataType}
                              onChange={(e) =>
                                updatePayload(payload.id, (item) => {
                                  const nextType = e.target.value;
                                  const shouldUpdate = shouldResetSampleValue(
                                    item.sampleValue,
                                    item.dataType
                                  );
                                  return {
                                    ...item,
                                    dataType: nextType,
                                    inferredType: false,
                                    sampleValue: shouldUpdate
                                      ? sampleValueForEventType(nextType)
                                      : item.sampleValue,
                                  };
                                })
                              }
                            >
                              {DATA_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              value={payload.sampleValue || ""}
                              onChange={(e) =>
                                updatePayload(payload.id, (item) => ({
                                  ...item,
                                  sampleValue: e.target.value,
                                }))
                              }
                              placeholder={sampleValueForEventType(payload.dataType)}
                            />
                          </td>
                          <td>
                            <input
                              value={payload.description}
                              onChange={(e) =>
                                updatePayload(payload.id, (item) => ({
                                  ...item,
                                  description: e.target.value,
                                }))
                              }
                              placeholder="Short explanation"
                            />
                          </td>
                          <td>
                            <button className="ghost" onClick={() => removePayload(payload.id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="secondary" onClick={addPayload}>
                    Add Payload
                  </button>

                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <h4>Array Payload</h4>
                    <button className="ghost" onClick={toggleArray}>
                      {draft.arrayPayload ? "Remove Array" : "Add Array"}
                    </button>
                  </div>
                  <p className="inline-note">
                    Array payloads are always exported as items[].field_name and must be arrays of
                    objects only.
                  </p>
                  {draft.arrayPayload ? (
                    <>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Field Name</th>
                            <th>Data Type</th>
                            <th>Sample Value</th>
                            <th>Description</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.arrayPayload.fields.map((payload) => (
                            <tr key={payload.id}>
                              <td>
                                <input
                                  value={payload.name}
                                  onChange={(e) =>
                                    updateArrayField(payload.id, (item) => ({
                                      ...item,
                                      name: e.target.value,
                                      inferredType: false,
                                    }))
                                  }
                                  onBlur={(e) =>
                                    updateArrayField(payload.id, (item) => ({
                                      ...item,
                                      name: normalizeSnakeCase(e.target.value),
                                    }))
                                  }
                                  placeholder="sku"
                                />
                              </td>
                              <td>
                                <select
                                  value={payload.dataType}
                                  onChange={(e) =>
                                    updateArrayField(payload.id, (item) => {
                                      const nextType = e.target.value;
                                      const shouldUpdate = shouldResetSampleValue(
                                        item.sampleValue,
                                        item.dataType
                                      );
                                      return {
                                        ...item,
                                        dataType: nextType,
                                        inferredType: false,
                                        sampleValue: shouldUpdate
                                          ? sampleValueForEventType(nextType)
                                          : item.sampleValue,
                                      };
                                    })
                                  }
                                >
                                  {DATA_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  value={payload.sampleValue || ""}
                                  onChange={(e) =>
                                    updateArrayField(payload.id, (item) => ({
                                      ...item,
                                      sampleValue: e.target.value,
                                    }))
                                  }
                                  placeholder={sampleValueForEventType(payload.dataType)}
                                />
                              </td>
                              <td>
                                <input
                                  value={payload.description}
                                  onChange={(e) =>
                                    updateArrayField(payload.id, (item) => ({
                                      ...item,
                                      description: e.target.value,
                                    }))
                                  }
                                  placeholder="Short explanation"
                                />
                              </td>
                              <td>
                                <button
                                  className="ghost"
                                  onClick={() => removeArrayField(payload.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button className="secondary" onClick={addArrayField}>
                        Add Array Field
                      </button>
                    </>
                  ) : (
                    <div className="empty-state">No array payload yet.</div>
                  )}

                  <h4>Validation</h4>
                  <div className="validation-list">
                    {errors.length === 0 && warnings.length === 0 && (
                      <div className="validation-item">No issues found.</div>
                    )}
                    {errors.map((message, index) => (
                      <div key={`error-${index}`} className="validation-item error">
                        {message}
                      </div>
                    ))}
                    {warnings.map((message, index) => (
                      <div key={`warn-${index}`} className="validation-item warning">
                        {message}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="summary-bar">
                  <div className="summary-chip">Event: {draft.eventName || "Untitled"}</div>
                  <div className="summary-chip">
                    Payloads: {draft.payloads.length} | Array fields:{" "}
                    {draft.arrayPayload ? draft.arrayPayload.fields.length : 0}
                  </div>
                  <p className="inline-note">{draft.description || "No description yet."}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AttributesManager = ({
  attributes,
  onAdd,
  onUpdate,
  onRemove,
  onToggleSelect,
  onSelectAll,
  onClearAll,
}) => {
  return (
    <div className="modal-section">
      <table className="table">
        <thead>
          <tr>
            <th>Include</th>
            <th>Attribute Name</th>
            <th>Data Type</th>
            <th>Sample Value</th>
            <th>Description</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {attributes.map((attribute) => {
            const issues = validateAttribute(attribute);
            return (
              <tr key={attribute.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={attribute.selected}
                    onChange={() => onToggleSelect(attribute.id)}
                  />
                </td>
                <td>
                  <input
                    value={attribute.name}
                    onChange={(e) =>
                      onUpdate(attribute.id, (attr) => ({
                        ...attr,
                        name: e.target.value,
                        inferredType: false,
                      }))
                    }
                    onBlur={(e) =>
                      onUpdate(attribute.id, (attr) => ({
                        ...attr,
                        name: normalizeUpperSnakeCase(e.target.value),
                      }))
                    }
                    placeholder="CUSTOMER_TIER"
                  />
                  {issues.errors.length > 0 && (
                    <div className="inline-note" style={{ color: "var(--error)" }}>
                      {issues.errors[0]}
                    </div>
                  )}
                </td>
                <td>
                  <select
                    value={attribute.dataType}
                    onChange={(e) =>
                      onUpdate(attribute.id, (attr) => {
                        const nextType = e.target.value;
                        const shouldUpdate = shouldResetSampleValue(
                          attr.sampleValue,
                          attr.dataType,
                          true
                        );
                        return {
                          ...attr,
                          dataType: nextType,
                          inferredType: false,
                          sampleValue: shouldUpdate
                            ? sampleValueForAttributeType(nextType)
                            : attr.sampleValue,
                        };
                      })
                    }
                  >
                    {DATA_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={attribute.sampleValue || ""}
                    onChange={(e) =>
                      onUpdate(attribute.id, (attr) => ({
                        ...attr,
                        sampleValue: e.target.value,
                      }))
                    }
                    placeholder={sampleValueForAttributeType(attribute.dataType)}
                  />
                </td>
                <td>
                  <input
                    value={attribute.description}
                    onChange={(e) =>
                      onUpdate(attribute.id, (attr) => ({
                        ...attr,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional description"
                  />
                </td>
                <td>
                  <button className="ghost" onClick={() => onRemove(attribute.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
        <button className="secondary" onClick={onAdd}>
          Add Attribute
        </button>
        <button className="ghost" onClick={onSelectAll}>
          Select All
        </button>
        <button className="ghost" onClick={onClearAll}>
          Clear Selection
        </button>
        <span className="inline-note">
          Attribute dates use YYYY-MM-DD. Arrays are not supported for attributes.
        </span>
      </div>
    </div>
  );
};

const ExportPreview = ({ events, attributes, onClose, onRemoveEvent }) => {
  const { attributeRows } = buildExportRows(events, attributes);
  const eventHeader = [
    "eventName",
    "eventPayload",
    "dataType",
    "sampleValue",
    "description",
    "eventDescription",
    "Action",
  ];
  const eventBody = events.flatMap((event) => {
    const payloads = [
      ...event.payloads.map((payload) => ({
        name: payload.name,
        dataType: payload.dataType,
        description: payload.description,
        sampleValue: payload.sampleValue,
      })),
      ...(event.arrayPayload
        ? event.arrayPayload.fields.map((payload) => ({
            name: `items[].${payload.name}`,
            dataType: payload.dataType,
            description: payload.description,
            sampleValue: payload.sampleValue,
          }))
        : []),
    ];

    if (payloads.length === 0) {
      return [
        {
          cells: [event.eventName, "", "", "", "", event.description || "", "remove"],
          event,
          isHeader: true,
        },
      ];
    }

    return payloads.map((payload, index) => ({
      cells: [
        index === 0 ? event.eventName : "",
        payload.name,
        payload.dataType,
        safeString(payload.sampleValue) || sampleValueForEventType(payload.dataType),
        payload.description || "",
        index === 0 ? event.description || "" : "",
        index === 0 ? "remove" : "",
      ],
      event: index === 0 ? event : null,
      isHeader: index === 0,
    }));
  });
  const attributeHeader = attributeRows[0] || [];
  const attributeBody = attributeRows.slice(1);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>Export Preview</h2>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-section">
          <h4>Events ({events.length})</h4>
          {events.length === 0 ? (
            <div className="empty-state">No events selected yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  {eventHeader.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventBody.map((row, index) => (
                  <tr key={`event-row-${index}`}>
                    {row.cells.map((cell, cellIndex) => {
                      if (cellIndex === row.cells.length - 1) {
                        return (
                          <td key={`event-cell-${index}-${cellIndex}`}>
                            {row.event ? (
                              <button
                                className="ghost"
                                onClick={() => onRemoveEvent(row.event)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </td>
                        );
                      }
                      return <td key={`event-cell-${index}-${cellIndex}`}>{cell}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-section">
          <h4>Attributes ({attributes.length})</h4>
          {attributes.length === 0 ? (
            <div className="empty-state">No attributes selected yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  {attributeHeader.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attributeBody.map((row, index) => (
                  <tr key={`attribute-row-${index}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`attr-cell-${index}-${cellIndex}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

const RulesOverlay = ({ onClose, children }) => (
  <div className="rules-backdrop" onClick={onClose}>
    <div
      className="rules-panel"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

const RulesPanel = ({ onClose }) => (
  <>
    <div className="rules-panel__header">
      <div>
        <h3>Validation Rules</h3>
        <p className="rules-panel__sub">Keep events CE-safe before exporting.</p>
      </div>
      <button className="ghost" onClick={onClose}>
        Close
      </button>
    </div>
    <div className="rules-grid">
      <div className="rules-card">
        <h4>Names</h4>
        <ul>
          <li>Events & payloads: lowercase snake_case.</li>
          <li>Attributes: UPPER_CASE_SNAKE_CASE.</li>
          <li>No nested arrays or nested objects.</li>
          <li>Only one array payload (<code>items[]</code>) per event.</li>
        </ul>
      </div>
      <div className="rules-card">
        <h4>Event dataTypes</h4>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Example</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>date</td>
              <td>"2025-12-12 11:11:25"</td>
              <td>YYYY-MM-DD HH:MM:SS (quoted)</td>
            </tr>
            <tr>
              <td>text</td>
              <td>"hello"</td>
              <td>Quoted string</td>
            </tr>
            <tr>
              <td>integer</td>
              <td>12</td>
              <td>Whole number</td>
            </tr>
            <tr>
              <td>float</td>
              <td>12.1</td>
              <td>Decimal</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rules-card">
        <h4>Array payload example</h4>
        <pre className="rules-code">
{`"items": [
  { "mrp": 250.0, "product_name": "Example", "quantity": 1 },
  { "mrp": 620.2, "product_name": "Example 2", "quantity": 1 }
]`}
        </pre>
        <div className="inline-note">Only array of objects is supported.</div>
      </div>
      <div className="rules-card">
        <h4>Attribute dataTypes</h4>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Example</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>date</td>
              <td>"2025-12-12"</td>
              <td>YYYY-MM-DD (quoted)</td>
            </tr>
            <tr>
              <td>text</td>
              <td>"hello"</td>
              <td>Quoted string</td>
            </tr>
            <tr>
              <td>integer</td>
              <td>12</td>
              <td>Whole number</td>
            </tr>
            <tr>
              <td>float</td>
              <td>12.1</td>
              <td>Decimal</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
