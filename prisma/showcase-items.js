// Optional portfolio data. The default seed in src/data.js stays stable for tests.
export const showcaseItems = [
  { id: "demo-espresso-beans", name: "에스프레소 원두", category: "커피", unit: "1kg", stock: 0, minimum: 3, target: 9, leadTimeDays: 4 },
  { id: "demo-decaf-beans", name: "디카페인 원두", category: "커피", unit: "1kg", stock: 5, minimum: 2, target: 8, leadTimeDays: 5 },
  { id: "demo-soy-milk", name: "두유", category: "음료", unit: "1L", stock: 3, minimum: 6, target: 15, leadTimeDays: 2 },
  { id: "demo-almond-milk", name: "아몬드밀크", category: "음료", unit: "1L", stock: 10, minimum: 4, target: 12, leadTimeDays: 3 },
  { id: "demo-hazelnut-syrup", name: "헤이즐넛 시럽", category: "시럽", unit: "1병", stock: 1, minimum: 3, target: 7, leadTimeDays: 4 },
  { id: "demo-strawberry-puree", name: "딸기 퓌레", category: "퓨레", unit: "1병", stock: 4, minimum: 2, target: 7, leadTimeDays: 3 },
  { id: "demo-chai-powder", name: "차이 파우더", category: "파우더", unit: "500g", stock: 2, minimum: 4, target: 8, leadTimeDays: 6 },
  { id: "demo-earl-grey-tea", name: "얼그레이 티", category: "차", unit: "100티백", stock: 7, minimum: 3, target: 10, leadTimeDays: 7 },
  { id: "demo-sugar", name: "백설탕", category: "재료", unit: "1kg", stock: 9, minimum: 5, target: 15, leadTimeDays: 2 },
  { id: "demo-ice-cups", name: "아이스컵", category: "소모품", unit: "50개/묶음", stock: 2, minimum: 4, target: 12, leadTimeDays: 3 },
  { id: "demo-paper-straws", name: "종이 빨대", category: "소모품", unit: "100개/묶음", stock: 8, minimum: 3, target: 12, leadTimeDays: 5 },
  { id: "demo-napkins", name: "냅킨", category: "소모품", unit: "200매/묶음", stock: 1, minimum: 3, target: 10, leadTimeDays: 2 },
  { id: "demo-cup-sleeves", name: "컵 홀더", category: "소모품", unit: "100개/묶음", stock: 6, minimum: 4, target: 12, leadTimeDays: 4 },
  { id: "demo-takeout-bags", name: "테이크아웃 봉투", category: "소모품", unit: "50개/묶음", stock: 0, minimum: 2, target: 8, leadTimeDays: 5 },
];

// Seven recent usage events make lead-time recommendations visible in the demo.
export const showcaseDailyUsage = {
  "demo-decaf-beans": 1,
  "demo-almond-milk": 4,
};
