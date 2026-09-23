import { test, expect } from "@playwright/test";

test("complete stock and ordering flow persists on refresh without console errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오트밀크", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "오트밀크 현재 재고 증가" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "오트밀크 현재 재고", exact: true }),
  ).toHaveValue("3");
  await expect(page.locator(".suggested-number")).toHaveText("7개");
  await page
    .getByRole("button", { name: "발주 목록에 추가", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "오트밀크 발주 수량", exact: true }),
  ).toHaveValue("7");
  await page.getByRole("button", { name: "오트밀크 발주 수량 증가" }).click();
  await page.getByRole("button", { name: "발주 목록에서 확인" }).click();
  await expect(page.locator(".queue-item")).toHaveCount(1);
  await expect(page.getByTestId("order-total")).toHaveText("8개");
  await page.reload();
  await expect(
    page.getByRole("spinbutton", { name: "오트밀크 현재 재고", exact: true }),
  ).toHaveValue("3");
  await expect(page.getByTestId("order-total")).toHaveText("8개");
  await page.getByRole("button", { name: "발주하기", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "발주 생성 · 오트밀크 8개",
  );
  await expect(page.getByRole("dialog")).toContainText("재고 2 → 3");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "오트밀크 현재 재고", exact: true }),
  ).toHaveValue("3");
  expect(errors).toEqual([]);
});
test("search, filters, queue removal and item selection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "품목 검색" }).fill("바닐라");
  await expect(page.locator(".item-row")).toHaveCount(1);
  await page.locator(".item-row").click();
  await expect(
    page.getByRole("heading", { name: "바닐라 시럽", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "발주 목록에 추가", exact: true })
    .click();
  await page
    .getByRole("button", { name: "바닐라 시럽 발주 수량 감소" })
    .click();
  await expect(page.getByTestId("order-total")).toHaveText("4개");
  await page
    .getByRole("button", { name: "바닐라 시럽 발주 목록에서 삭제" })
    .click();
  await expect(
    page.getByRole("button", { name: "발주하기", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "검색 지우기" }).click();
  await page.getByRole("button", { name: "정상", exact: true }).click();
  await expect(page.locator(".item-row")).toHaveCount(5);
  await page.getByRole("button", { name: "발주 필요", exact: true }).click();
  await expect(page.locator(".item-row")).toHaveCount(5);
  await page.getByRole("button", { name: "긴급", exact: true }).click();
  await expect(page.locator(".item-row")).toHaveCount(3);
});
test("create, validate, edit and delete item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "품목 등록", exact: true }).click();
  await page.getByLabel("품목명", { exact: true }).fill("테스트 우유");
  await page.getByLabel("카테고리", { exact: true }).fill("음료");
  await page.getByLabel("단위", { exact: true }).fill("1L");
  await page.getByLabel("현재 재고", { exact: true }).fill("2");
  await page.getByLabel("최소 재고", { exact: true }).fill("5");
  await page.getByLabel("적정 재고", { exact: true }).fill("3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "품목 등록" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "적정 재고는 최소 재고 이상",
  );
  await page.getByLabel("적정 재고", { exact: true }).fill("10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "품목 등록" })
    .click();
  await expect(
    page.getByRole("heading", { name: "테스트 우유", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "품목 수정", exact: true }).click();
  await page.getByLabel("품목명", { exact: true }).fill("수정 우유");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await page
    .getByRole("button", { name: "발주 목록에 추가", exact: true })
    .click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("button", { name: "품목 삭제", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".item-row")).toHaveCount(10);
  await expect(page.locator(".item-list")).not.toContainText("수정 우유");
});
for (const width of [1440, 1280, 1024]) {
  test(`desktop layout and screenshot at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "발주 목록에 추가", exact: true })
      .click();
    if (width === 1024) {
      await expect(page.locator(".order-queue")).toBeVisible();
      await page.getByRole("button", { name: "발주 목록 닫기" }).last().click();
      await page.getByRole("button", { name: "발주 목록 1" }).click();
      await expect(page.getByTestId("queue-oat")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const overflow = await page
      .locator(
        ".item-browser, .item-workspace, .order-queue, .item-row, .title-line",
      )
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (node) =>
              node.getBoundingClientRect().width &&
              node.scrollWidth > node.clientWidth + 2,
          )
          .map((node) => node.className),
      );
    expect(overflow).toEqual([]);
    await page.getByRole("button", { name: "알림 닫기" }).click();
    const actionBox = await page.locator(".add-order").boundingBox();
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(900);
    await page.screenshot({
      path: `test-results/workspace-${width}.png`,
      fullPage: true,
    });
  });
}
test("corrupt saved data is preserved with an explicit warning", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("cafe-inventory:v1", "{broken"),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("원본 보호");
  await page.getByRole("button", { name: "오트밀크 현재 재고 증가" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("cafe-inventory:v1")),
  ).toBe("{broken");
});
