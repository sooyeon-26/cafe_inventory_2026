# Cafe Inventory

카페 재고 확인부터 발주 준비까지 한 화면에서 이어지는 React 워크스페이스입니다. 품목, 재고, 발주 대기열, 발주 기록, History는 Express API와 PostgreSQL에 저장됩니다. 발주하기는 데모 기록을 생성하며 실제 공급업체에 주문을 전송하지 않습니다.

## 실행

Node.js 22 이상과 PostgreSQL을 준비합니다. `.env.example`을 복사해 `.env`를 만들고 `DATABASE_URL`에 사용할 PostgreSQL 데이터베이스의 연결 문자열을 설정하세요. `.env`는 Git에서 제외됩니다. `PORT`는 선택 사항이며 기본값은 `3001`입니다.

```sh
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

`npm run dev`는 API(`http://127.0.0.1:3001`)와 Vite 프론트엔드(`http://127.0.0.1:5173`)를 함께 실행합니다. 각각 실행하려면 `npm run dev:backend`와 `npm run dev:frontend`를 별도 터미널에서 사용하세요. Vite 개발 서버는 `/api` 요청을 백엔드로 전달합니다. 배포 시에도 프론트엔드의 `/api` 요청을 API 서버로 라우팅해야 합니다.

개발 중 스키마를 수정할 때는 `npm run db:migrate -- --name <변경명>`으로 migration을 생성·적용합니다. 기존 migration만 적용할 때는 `npm run db:deploy`를 사용합니다. 주문 상태 migration은 기존 발주를 `ORDERED`로 유지합니다. `npm run db:seed`는 현재 데모 품목 10개를 ID 기준으로 upsert하고 기존 수정 값은 덮어쓰지 않아 반복 실행해도 중복 생성되지 않습니다. 포트폴리오 화면에 품목을 더 채우려면 기본 seed 실행 후 `npm run db:seed:showcase`를 선택적으로 실행하세요. 추가 품목 14개와 두 품목의 최근 7일 사용 이력이 등록되어, 최소 재고보다 많아도 납품 소요 전에 소진되어 발주가 필요한 사례를 보여줍니다. 다시 실행해도 기존 수정값과 이력을 덮어쓰거나 중복 생성하지 않습니다. 프론트엔드 빌드는 `npm run build`, 빌드 결과 미리보기는 `npm run preview`입니다.

## 데이터와 API

`Item.openingStock`은 Movement 기록을 시작할 때의 잔액입니다. Migration은 Movement가 있으면 가장 오래된 기록의 변경 전 수량, 없으면 기존 `stock`을 시작 잔액으로 저장하며 현재고는 바꾸지 않습니다. `npm run db:audit:stock`은 삭제 처리된 품목까지 포함해 `openingStock + Σ quantityChange = stock`과 Movement 전후 수량의 연결을 읽기 전용으로 검사하고, 불일치가 있으면 종료 코드 1을 반환합니다. DB 제약은 품목·발주 수량의 범위와 Movement 전후 수량·변경 방향을 검사합니다.

추천 계산의 기준 시각을 주입할 수 있어 최근 7×24시간 경계와 자정 동작을 고정 시각으로 테스트합니다. `npm run db:reset:showcase`는 시연용 두 품목의 사용 이력 7일치를 현재 시각 기준으로 다시 생성합니다. 해당 품목의 재고가 바뀌었거나 시연용이 아닌 Movement가 있으면 안전하게 중단하고 다른 품목 기록은 수정하지 않습니다.

새 `ActivityEvent`는 `type`과 관련 `itemId` 또는 `orderId`를 저장합니다. 이전 문자열 기록은 `LEGACY` 유형으로 보존하며 관계 ID를 임의로 추정하지 않습니다. `GET /history`는 선택적 `itemId`·`orderId` 필터를 지원하며 재고 Movement도 같은 기준으로 조회합니다. 서버는 입력 검증, 재고 변경, 발주 전환을 각각 별도 모듈에서 처리하고 프론트엔드는 조회와 변경 훅을 분리합니다.

발주 품목은 `OrderLine` 관계형 테이블에 품목 ID, 발주 시점 이름·단위, 발주 수량, 누적 입고 수량으로 저장합니다. Migration은 기존 `Order.lines` JSON을 이 테이블로 옮기며, 기존 `RECEIVED`·`COMPLETED` 주문의 누적 입고량은 발주량과 같게 기록합니다. `ORDERED` 주문은 미입고로 유지하고 기존 재고 및 Movement는 변경하지 않습니다.

입고는 일부 품목 또는 일부 수량만 처리할 수 있습니다. `ORDERED` → `PARTIALLY_RECEIVED` → `RECEIVED` → `COMPLETED` 순서이며 전량 입고되기 전에는 완료할 수 없습니다. 주문·품목 행을 잠근 한 트랜잭션에서 `OrderLine.receivedQuantity`, 현재고, 주문 상태, 주문 ID가 연결된 `RESTOCK` Movement를 함께 저장합니다. `POST /orders/:id/receive`에 `{ "lines": [{ "itemId": "oat", "quantity": 6 }] }`을 보내면 선택 수량만 입고하고, 본문을 생략하면 남은 수량을 모두 입고합니다. 잔여량 초과와 중복 입고는 거부합니다.

`Item`은 화면의 `stock`, `minimum`, `target` 필드명을 유지합니다. `stock`은 현재 잔액이며, 변경 시 `StockMovement`에 유형·변경량·변경 전후 수량·메모·시각을 함께 기록합니다. 두 쓰기는 한 PostgreSQL 트랜잭션에서 처리하고 같은 품목 행을 잠가 동시 변경의 순서를 보장합니다. `QueueEntry`는 발주 대기열을, `ActivityEvent`는 품목·발주 활동 및 도입 이전의 문자열 기록을, `Order`는 발주 스냅샷과 상태를 저장합니다. 새 재고 변경은 `ActivityEvent`에 중복 기록하지 않습니다.

발주 생성만으로 재고는 바뀌지 않습니다. 입고할 품목이 삭제된 경우 해당 요청의 재고·입고량·Movement 전체가 롤백됩니다.

`USAGE`는 사용·소비, `RESTOCK`은 입고, `WASTE`는 폐기, `ADJUSTMENT`는 수동 조정입니다. 화면의 `−`는 `USAGE`, `+`와 직접 수량 입력은 `ADJUSTMENT`로 기록됩니다. 재고 변경 창에서 유형·수량·메모를 선택할 수 있습니다. 기존 DB의 `Item.stock`은 migration에서 바꾸지 않고 도입 시점의 시작 잔액으로 취급하므로 과거 이동 이벤트를 임의로 생성하지 않습니다. 새 품목의 초기 재고가 0보다 크면 `ADJUSTMENT` 시작 이벤트가 생성됩니다. 삭제된 품목은 화면에서 숨기되 DB 행과 Movement 관계를 보존합니다.

품목별 `leadTimeDays`는 납품 소요일이며 기본값은 2일(허용 범위 1~365일)입니다. Migration은 기존 품목에 기본값만 추가하고 재고와 Movement를 보존합니다. 서버는 조회 시점부터 최근 7×24시간의 `USAGE` 변경량만 합쳐 7로 나눈 일평균 사용량을 계산합니다. 기록이 없는 날도 분모에 포함하며, 사용 기록이 없으면 평균 0·예상 소진일 `null`로 반환합니다. 예상 소진일은 `stock / averageDailyUsage`입니다.

발주 상태 우선순위는 **긴급**(재고 0 또는 예상 소진 1일 미만) → **발주 필요**(재고가 최소 재고 이하 또는 예상 소진일이 납품 소요일 이하) → **정상**입니다. 사용 기록이 없는 품목은 최소 재고 기준으로 판단하고 권장 수량은 기존 `max(target - stock, 0)`을 유지합니다. 사용 기록이 있으면 권장 수량은 `max(target, minimum + ceil(일평균 사용량 × 납품 소요일)) - stock`의 양수 부분으로 계산하며 발주 수량 상한을 적용합니다. `RESTOCK`, `WASTE`, `ADJUSTMENT`는 사용량에 포함하지 않습니다. 화면과 발주 대기열은 서버에서 반환한 같은 추천 수량을 사용합니다.

API의 성공 응답은 `{ "data": ... }`, 오류 응답은 `{ "error": { "code": "...", "message": "..." } }` 형식입니다. 아래 경로는 `/api` 접두사로도 사용할 수 있습니다.

| Method | Path | 기능 |
| --- | --- | --- |
| GET | `/health` | DB 연결 확인 |
| GET | `/state` | 호환용 품목·대기열·최근 History 20건 조회 |
| GET | `/history?limit=20&cursor=...&itemId=...&orderId=...` | 활동 및 재고 변경 이력 커서 조회·선택 필터 (`entries`, `nextCursor`, `hasMore`) |
| GET | `/items` | 전체 품목 조회 |
| GET | `/items/:id` | 단일 품목 조회 |
| POST | `/items` | 품목 등록 |
| PATCH | `/items/:id` | 품목 정보·기준 재고 수정 |
| PATCH | `/items/:id/stock` | 현재 재고 수정 |
| POST | `/items/:id/movements` | 유형별 재고 변경 및 Movement 기록 |
| GET | `/items/:id/movements` | 품목의 재고 변경 내역 |
| GET | `/movements` | 전체 재고 변경 내역 (`itemId`, `type` 필터 선택) |
| DELETE | `/items/:id` | 품목 숨김 및 대기열 항목 삭제 (Movement 보존) |
| GET | `/queue` | 발주 대기열 조회 |
| POST | `/queue` | 발주 대기열 추가 |
| PATCH | `/queue/:id` | 발주 수량 수정 |
| DELETE | `/queue/:id` | 발주 대기열 제거 |
| POST | `/orders` | 데모 발주 기록 및 대기열 비우기 |
| GET | `/orders` | 최근 발주 50건과 상태 조회 |
| GET | `/orders/:id` | 단일 발주 조회 |
| POST | `/orders/:id/receive` | 선택 수량 또는 잔여 전량 입고 및 `RESTOCK` Movement 기록 |
| POST | `/orders/:id/complete` | 입고된 발주 완료 처리 |

품목 응답에는 `leadTimeDays`, `averageDailyUsage`, `estimatedDaysUntilStockout`, `reorderStatus`, `recommendedQuantity`, `reorderReason`이 포함됩니다. 수량은 0~999,999의 정수이고 발주 수량은 1 이상이며 적정 재고는 최소 재고 이상이어야 합니다. 정상 상태에서도 적정 재고까지의 차이가 있으면 선택 보충량으로 표시합니다. 브라우저의 과거 `cafe-inventory:v1` localStorage 값은 읽거나 덮어쓰지 않습니다. 기존 브라우저에만 있던 사용자 지정 데이터가 있다면 별도로 내보낸 뒤 API로 이전해야 합니다.

`POST /items/:id/movements`는 사용·입고·폐기에 `{ "type": "USAGE", "quantity": 2, "note": "오전 사용" }`처럼 양수 수량을 받고, 수동 조정에는 `{ "type": "ADJUSTMENT", "afterQuantity": 8 }` 또는 `{ "type": "ADJUSTMENT", "quantityChange": 1 }`을 받습니다. 빠른 조정과 기존 `PATCH /items/:id/stock`도 Movement를 생성합니다. History의 새 재고 항목은 Movement에서 읽으며, 이전 문자열 활동 기록은 그대로 남습니다.

## 프론트엔드 서버 상태

TanStack Query가 품목 `['items']`, 발주 대기열 `['orders', 'draft']`, 발주 목록 `['orders']`, History `['history']`를 각각 캐시합니다. History는 20건씩 커서로 조회하고 더 보기로 이전 기록을 불러옵니다. 새 기록이 추가되어도 다음 페이지가 밀리지 않습니다. `src/queryKeys.js`에 품목 상세·Movement·주문 키도 같은 규칙으로 정의했습니다. 검색어, 필터, 선택 품목, 열려 있는 창은 React의 화면 상태로 유지합니다. 기존 `/state` API는 호환성을 위해 남겨두되 History는 최근 20건만 반환합니다. 화면은 범위별 조회 API를 사용합니다. 창으로 돌아오거나 연결이 복구되면 최신 데이터를 확인하고, 열린 화면에서는 60초 간격으로 다시 조회합니다.

현재고 `+/-`와 대기열 추가·수량 변경·삭제는 요청 전에 캐시를 갱신합니다. 실패하면 변경 전 스냅샷과 아직 대기 중인 작업을 기준으로 복원하고 작은 오류 알림을 표시합니다. 같은 품목의 빠른 재고 클릭과 대기열 변경 요청은 순서대로 전송합니다. 재고 추천값은 대기 중에 수량 차이만 임시 반영하고 서버 조회 결과로 확정합니다. 재고 변경은 품목·History·Movement, 대기열 변경은 draft만 다시 확인합니다. 품목 등록·수정·삭제, 상세 재고 변경, 데모 발주 생성은 서버 응답 후 갱신하며 낙관적으로 완료 처리하지 않습니다.

## 테스트

API와 브라우저 통합 테스트에는 이름이 `_test`로 끝나는 별도 PostgreSQL 데이터베이스를 만들고 `TEST_DATABASE_URL`을 설정하세요. `DATABASE_URL`을 테스트 DB URL로 일시 설정한 상태에서 `npm run db:deploy`와 `npm run db:seed`를 실행해 준비합니다. 통합 테스트는 그 DB의 품목·Movement·대기열·이력·데모 발주를 초기화하므로 운영 DB URL을 사용하면 안 됩니다.

```sh
npm test
npm run lint
npm run build
npm run test:api
npx playwright install chromium
npm run test:e2e
```

브라우저 테스트는 테스트 DB에 연결한 API와 프론트엔드를 자동으로 실행하고, Movement 유형과 History, 새로고침 후 유지, 품목 CRUD, 발주·필터·반응형 레이아웃을 확인합니다. 응답 지연 및 실패를 주입해 빠른 재고 클릭, 대기열 즉시 반영과 rollback도 확인합니다. 부분 입고·완료, History 페이지 추가 로드, 창 복귀 후 재조회도 확인합니다. API 테스트는 변경 전후 수량, 동시 요청의 순서, Movement 저장 실패와 다중 품목 입고 실패 시 전체 롤백도 확인합니다.

## 구조

- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.js`: PostgreSQL 모델, migration, 데모 품목
- `prisma/audit-stock.js`, `prisma/showcase-seed.js`: 재고 잔액 검사와 시연 이력 생성·재생성
- `server/app.js`, `server/index.js`, `server/validation.js`, `server/inventory-service.js`, `server/order-service.js`, `server/reorder.js`: Express 라우트, 검증, 재고·발주 트랜잭션, 추천 계산
- `src/api.js`, `src/queryKeys.js`, `src/useInventory.js`, `src/useInventoryMutations.js`: API 호출, Query 조회·변경 캐시, 화면 오류 상태
- `src/App.jsx`, `src/components/`: 기존 워크스페이스 화면과 인터랙션
- `src/inventory.js`: 서버가 제공한 발주 상태에 따른 화면 필터
- `tests/`: 계산 단위 테스트, API 및 브라우저 통합 테스트
