import { MAX_QUANTITY } from "../src/inventory.js";

export const itemFields = ["name", "category", "unit", "stock", "minimum", "target", "leadTimeDays"];
const textLimits = { name: 60, category: 30, unit: 20 };
const movementTypes = new Set(["USAGE", "RESTOCK", "WASTE", "ADJUSTMENT"]);

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message) => new HttpError(400, "VALIDATION_ERROR", message);
export const notFound = (message) => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message) => new HttpError(409, "CONFLICT", message);
export function quantity(value, field, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > MAX_QUANTITY)
    throw badRequest(`${field}은(는) ${min}~${MAX_QUANTITY} 사이 정수여야 합니다.`);
  return value;
}

export function itemInput(body, previous) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw badRequest("품목 정보를 입력해 주세요.");
  if (Object.keys(body).some((key) => !itemFields.includes(key)))
    throw badRequest("지원하지 않는 품목 필드가 있습니다.");
  if (!previous && itemFields.some((key) => key !== "leadTimeDays" && !(key in body)))
    throw badRequest("품목 정보를 모두 입력해 주세요.");
  if (previous && !Object.keys(body).length)
    throw badRequest("수정할 필드를 입력해 주세요.");
  const data = {};
  for (const key of itemFields) {
    if (!(key in body)) continue;
    if (key in textLimits) {
      const value = body[key];
      if (typeof value !== "string" || !value.trim() || value.trim().length > textLimits[key])
        throw badRequest(`${key}은(는) 1~${textLimits[key]}자여야 합니다.`);
      data[key] = value.trim();
    } else if (key === "leadTimeDays") {
      data[key] = quantity(body[key], key, 1);
      if (data[key] > 365) throw badRequest("leadTimeDays는 1~365일이어야 합니다.");
    } else data[key] = quantity(body[key], key);
  }
  if ((data.target ?? previous?.target) < (data.minimum ?? previous?.minimum))
    throw badRequest("적정 재고는 최소 재고 이상이어야 합니다.");
  return data;
}

export function movementNote(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 240)
    throw badRequest("메모는 240자 이하여야 합니다.");
  return value.trim() || null;
}

export function movementType(value) {
  if (!movementTypes.has(value)) throw badRequest("올바른 재고 변경 유형을 선택해 주세요.");
  return value;
}

export function assertMovementDirection(type, change) {
  if (!change) throw badRequest("재고 변경량은 0일 수 없습니다.");
  if (type === "RESTOCK" && change < 0) throw badRequest("입고 수량은 증가해야 합니다.");
  if ((type === "USAGE" || type === "WASTE") && change > 0)
    throw badRequest("사용·폐기 수량은 감소해야 합니다.");
}

export function movementInput(body, currentStock) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw badRequest("재고 변경 정보를 입력해 주세요.");
  const type = movementType(body.type);
  const allowed = type === "ADJUSTMENT"
    ? ["type", "afterQuantity", "quantityChange", "note"] : ["type", "quantity", "note"];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw badRequest("지원하지 않는 재고 변경 필드가 있습니다.");
  let afterQuantity;
  if (type === "ADJUSTMENT") {
    if (("afterQuantity" in body) === ("quantityChange" in body))
      throw badRequest("변경 후 수량 또는 변경량 중 하나만 입력해 주세요.");
    if ("quantityChange" in body) {
      const change = body.quantityChange;
      if (!Number.isSafeInteger(change) || !change || Math.abs(change) > MAX_QUANTITY)
        throw badRequest("변경량은 0이 아닌 정수여야 합니다.");
      afterQuantity = currentStock + change;
    } else afterQuantity = quantity(body.afterQuantity, "afterQuantity");
  } else afterQuantity = currentStock + (type === "RESTOCK"
    ? quantity(body.quantity, "quantity", 1) : -quantity(body.quantity, "quantity", 1));
  return { type, afterQuantity, note: movementNote(body.note) };
}

export function receiptInput(body) {
  if (body && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "lines")))
    throw badRequest("입고 요청에는 lines만 입력해 주세요.");
  const requested = body?.lines;
  if (requested !== undefined && (!Array.isArray(requested) || !requested.length || requested.some((line) =>
    !line || typeof line !== "object" || Array.isArray(line) ||
    Object.keys(line).some((key) => !["itemId", "quantity"].includes(key)) ||
    typeof line.itemId !== "string" || !line.itemId)))
    throw badRequest("입고 품목과 수량을 입력해 주세요.");
  if (requested) {
    const ids = requested.map((line) => line.itemId);
    if (new Set(ids).size !== ids.length) throw badRequest("입고 품목이 중복되었습니다.");
    requested.forEach((line) => quantity(line.quantity, "입고 수량", 1));
  }
  return requested;
}
