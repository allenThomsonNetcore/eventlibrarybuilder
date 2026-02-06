const { useEffect, useMemo, useState } = React;

const STORAGE_KEY = "ce-event-library-v2";
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

const createPayload = ({ name, dataType, description, inferredType }) => ({
  id: uid("pl"),
  name,
  dataType: dataType || "text",
  description: description || "",
  inferredType: Boolean(inferredType),
});

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

const createAttribute = ({ name, dataType, description, inferredType, selected }) => ({
  id: uid("attr"),
  name,
  dataType: dataType || "text",
  description: description || "",
  inferredType: Boolean(inferredType),
  selected: Boolean(selected),
});

const normalizeEventShape = (event) => ({
  ...event,
  payloads: Array.isArray(event.payloads) ? event.payloads : [],
  arrayPayload: event.arrayPayload || null,
  selected: Boolean(event.selected),
  arrayConflict: Boolean(event.arrayConflict),
});

const normalizeIndustryShape = (industry) => ({
  ...industry,
  events: Array.isArray(industry.events)
    ? industry.events.map(normalizeEventShape)
    : [],
});

const normalizeAttributeShape = (attribute) => ({
  ...attribute,
  selected: Boolean(attribute.selected),
  inferredType: Boolean(attribute.inferredType),
});

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

const buildExportRows = (events, attributes) => {
  const eventRows = [["eventName", "eventPayload", "dataType", "description"]];
  events.forEach((event) => {
    const payloads = [
      ...event.payloads.map((payload) => ({
        name: payload.name,
        dataType: payload.dataType,
        description: payload.description,
      })),
      ...(event.arrayPayload
        ? event.arrayPayload.fields.map((payload) => ({
            name: `items[].${payload.name}`,
            dataType: payload.dataType,
            description: payload.description,
          }))
        : []),
    ];

    if (payloads.length === 0) {
      eventRows.push([event.eventName, "", "", event.description || ""]);
      return;
    }

    payloads.forEach((payload, index) => {
      eventRows.push([
        index === 0 ? event.eventName : "",
        payload.name,
        payload.dataType,
        payload.description || "",
      ]);
    });
  });

  const attributeRows = [
    ["ATTRIBUTE", "DATATYPE", "DESCRIPTION"],
    ...attributes.map((attribute) => [
      attribute.name,
      attribute.dataType,
      attribute.description || "",
    ]),
  ];

  return { eventRows, attributeRows };
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
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadFromWorkbook = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("./Event_library.xlsx");
      if (!response.ok) {
        throw new Error("Unable to load Event_library.xlsx.");
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [industries, attributes, selectedIndustry, view, exportName, hydrated]);

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

  const handleSaveEvent = (industryName, updatedEvent) => {
    updateEvent(industryName, updatedEvent.id, () => updatedEvent);
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
    setEditingEvent({ industry: selectedIndustry, eventId: newEvent.id });
  };

  const handleExport = () => {
    const { eventRows, attributeRows } = buildExportRows(selectedEvents, selectedAttributes);

    const wb = XLSX.utils.book_new();
    const wsEvents = XLSX.utils.aoa_to_sheet(eventRows);
    const wsAttributes = XLSX.utils.aoa_to_sheet(attributeRows);

    XLSX.utils.book_append_sheet(wb, wsEvents, "Events");
    XLSX.utils.book_append_sheet(wb, wsAttributes, "Attributes");
    const safeBaseName = sanitizeFileName(exportName) || defaultExportName;
    const fileName = safeBaseName.toLowerCase().endsWith(".xlsx")
      ? safeBaseName
      : `${safeBaseName}.xlsx`;
    XLSX.writeFile(wb, fileName);
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

  if (loading) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="title-block">
            <h1>Event Library Builder</h1>
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
            <h1>Event Library Builder</h1>
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
          <h1>Event Library Builder</h1>
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
          <button className="ghost" onClick={handleReload}>
            Reload Source
          </button>
          <button className="ghost" onClick={() => setPreviewOpen(true)}>
            Preview Export
          </button>
          <button className="primary" onClick={handleExport} disabled={!canExport}>
            Export Clean Excel
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
            <div
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
            </div>
          </div>

          {view === "library" ? (
            <>
              {currentIndustry ? (
                <div className="event-grid">
                  {currentIndustry.events.map((event, index) => (
                    <EventCard
                      key={event.id}
                      event={event}
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
          onClose={() => setEditingEvent(null)}
          onSave={(updatedEvent) => handleSaveEvent(editingEvent.industry, updatedEvent)}
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
    </div>
  );
};

const EventCard = ({ event, onEdit, onToggleSelect }) => {
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
        {errors.length > 0 && (
          <span className="badge error">{errors.length} errors</span>
        )}
        {warnings.length > 0 && (
          <span className="badge warning">{warnings.length} warnings</span>
        )}
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

const EventEditor = ({ event, onClose, onSave }) => {
  const [draft, setDraft] = useState(() => (event ? JSON.parse(JSON.stringify(event)) : null));

  useEffect(() => {
    if (event) {
      setDraft(JSON.parse(JSON.stringify(event)));
    }
  }, [event]);

  if (!event || !draft) return null;

  const { errors, warnings } = validateEvent(draft);

  const updateDraft = (updater) => setDraft((prev) => updater({ ...prev }));

  const updatePayload = (payloadId, updater) => {
    updateDraft((current) => ({
      ...current,
      payloads: current.payloads.map((payload) =>
        payload.id === payloadId ? updater({ ...payload }) : payload
      ),
    }));
  };

  const updateArrayField = (payloadId, updater) => {
    updateDraft((current) => {
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
  };

  const addPayload = () => {
    updateDraft((current) => ({
      ...current,
      payloads: [
        ...current.payloads,
        createPayload({ name: "", dataType: "text", description: "" }),
      ],
    }));
  };

  const addArrayField = () => {
    updateDraft((current) => {
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
    updateDraft((current) => ({
      ...current,
      payloads: current.payloads.filter((payload) => payload.id !== payloadId),
    }));
  };

  const removeArrayField = (payloadId) => {
    updateDraft((current) => {
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
    updateDraft((current) => ({
      ...current,
      arrayPayload: current.arrayPayload ? null : { name: "items", fields: [] },
    }));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>Edit Event</h2>
          <div className="action-row">
            <button className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" onClick={() => onSave(draft)}>
              Save Changes
            </button>
          </div>
        </div>

        <div className="modal-section">
          <h4>Event Details</h4>
          <label className="inline-note">Event name (lowercase snake_case, max 50)</label>
          <input
            className="input"
            value={draft.eventName}
            onChange={(e) =>
              updateDraft((current) => ({ ...current, eventName: e.target.value }))
            }
            onBlur={(e) =>
              updateDraft((current) => ({
                ...current,
                eventName: normalizeSnakeCase(e.target.value),
              }))
            }
            placeholder="screen_load"
          />
          <label className="inline-note">Description</label>
          <textarea
            className="textarea"
            value={draft.description}
            onChange={(e) =>
              updateDraft((current) => ({ ...current, description: e.target.value }))
            }
            placeholder="Explain when this event fires."
          />
        </div>

        <div className="modal-section">
          <h4>Payloads</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Payload Name</th>
                <th>Data Type</th>
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
                        updatePayload(payload.id, (item) => ({
                          ...item,
                          dataType: e.target.value,
                          inferredType: false,
                        }))
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
        </div>

        <div className="modal-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                            updateArrayField(payload.id, (item) => ({
                              ...item,
                              dataType: e.target.value,
                              inferredType: false,
                            }))
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
        </div>

        <div className="modal-section">
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
        </div>
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
                      onUpdate(attribute.id, (attr) => ({
                        ...attr,
                        dataType: e.target.value,
                        inferredType: false,
                      }))
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
  const eventHeader = ["eventName", "eventPayload", "dataType", "description", "Action"];
  const eventBody = events.flatMap((event) => {
    const payloads = [
      ...event.payloads.map((payload) => ({
        name: payload.name,
        dataType: payload.dataType,
        description: payload.description,
      })),
      ...(event.arrayPayload
        ? event.arrayPayload.fields.map((payload) => ({
            name: `items[].${payload.name}`,
            dataType: payload.dataType,
            description: payload.description,
          }))
        : []),
    ];

    if (payloads.length === 0) {
      return [
        {
          cells: [event.eventName, "", "", event.description || "", "remove"],
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
        payload.description || "",
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
