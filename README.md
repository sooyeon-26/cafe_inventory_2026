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

개발 중 스키마를 수정할 때는 `npm run db:migrate -- --name <변경명>`으로 migration을 생성·적용합니다. 기존 migration만 적용할 때는 `npm run db:deploy`를 사용합니다. `npm run db:seed`는 현재 데모 품목 10개를 ID 기준으로 upsert하고 기존 수정 값은 덮어쓰지 않아 반복 실행해도 중복 생성되지 않습니다. 프론트엔드 빌드는 `npm run build`, 빌드 결과 미리보기는 `npm run preview`입니다.

## 데이터와 API

`Item`은 기존 화면의 필드명인 `stock`, `minimum`, `target`을 유지하며 `id`, `name`, `category`, `unit`, `createdAt`, `updatedAt`을 가집니다. `QueueEntry`는 품목별 발주 수량을, `ActivityEvent`는 화면의 History를, `Order`는 발주 시점의 품목·수량 스냅샷을 저장합니다. 이번 단계에서는 재고 이동 내역이나 주문 상태 모델을 사용하지 않습니다.

API의 성공 응답은 `{ "data": ... }`, 오류 응답은 `{ "error": { "code": "...", "message": "..." } }` 형식입니다. 아래 경로는 `/api` 접두사로도 사용할 수 있습니다.

| Method | Path | 기능 |
| --- | --- | --- |
| GET | `/health` | DB 연결 확인 |
| GET | `/state` | 화면의 품목·대기열·History 조회 |
| GET | `/items` | 전체 품목 조회 |
| GET | `/items/:id` | 단일 품목 조회 |
| POST | `/items` | 품목 등록 |
| PATCH | `/items/:id` | 품목 정보·기준 재고 수정 |
| PATCH | `/items/:id/stock` | 현재 재고 수정 |
| DELETE | `/items/:id` | 품목 및 대기열 항목 삭제 |
| POST | `/queue` | 발주 대기열 추가 |
| PATCH | `/queue/:id` | 발주 수량 수정 |
| DELETE | `/queue/:id` | 발주 대기열 제거 |
| POST | `/orders` | 데모 발주 기록 및 대기열 비우기 |

기존 발주 제안량은 `max(적정 재고 - 현재 재고, 0)`입니다. 수량은 0~999,999의 정수이고 발주 수량은 1 이상이며 적정 재고는 최소 재고 이상이어야 합니다. 발주는 입고를 의미하지 않으므로 재고를 변경하지 않습니다. 브라우저의 과거 `cafe-inventory:v1` localStorage 값은 읽거나 덮어쓰지 않습니다. 기존 브라우저에만 있던 사용자 지정 데이터가 있다면 별도로 내보낸 뒤 API로 이전해야 합니다.

## 테스트

API와 브라우저 통합 테스트에는 이름이 `_test`로 끝나는 별도 PostgreSQL 데이터베이스를 만들고 `TEST_DATABASE_URL`을 설정하세요. `DATABASE_URL`을 테스트 DB URL로 일시 설정한 상태에서 `npm run db:deploy`와 `npm run db:seed`를 실행해 준비합니다. 브라우저 테스트는 매 테스트 전에 그 DB의 품목·대기열·이력·데모 발주를 초기화하므로 운영 DB URL을 사용하면 안 됩니다.

```sh
npm test
npm run lint
npm run build
npm run test:api
npx playwright install chromium
npm run test:e2e
```

브라우저 테스트는 테스트 DB에 연결한 API와 프론트엔드를 자동으로 실행하고, 재고·발주·품목 CRUD, 새로고침 후 유지, 필터와 반응형 레이아웃을 확인합니다.

## 구조

- `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.js`: PostgreSQL 모델, migration, 데모 품목
- `server/app.js`, `server/index.js`: Express API와 서버 실행
- `src/api.js`, `src/useInventory.js`: API 호출과 화면 로딩·저장·오류 상태
- `src/App.jsx`, `src/components/`: 기존 워크스페이스 화면과 인터랙션
- `src/inventory.js`: 재고 상태·발주 제안·필터 계산
- `tests/`: 계산 단위 테스트, API 및 브라우저 통합 테스트
