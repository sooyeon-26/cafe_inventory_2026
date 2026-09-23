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

test("filter counts follow live stock while search retains inventory totals", async ({
  page,
}) => {
  await page.goto("/");
  const urgent = page.getByRole("button", { name: "긴급", exact: true });
  const normal = page.getByRole("button", { name: "정상", exact: true });
  const low = page.getByRole("button", { name: "발주 필요", exact: true });
  await expect(urgent).toHaveText("긴급3");
  await page
    .getByRole("spinbutton", { name: "오트밀크 현재 재고", exact: true })
    .fill("5");
  await expect(urgent).toHaveText("긴급2");
  await expect(normal).toHaveText("정상6");
  await expect(low).toHaveText("발주4");
  await expect(page.locator(".item-workspace .status")).toHaveText("정상");
  await expect(page.locator(".suggested-number")).toHaveText("5개");
  await page.getByRole("textbox", { name: "품목 검색" }).fill("오트");
  await expect(normal).toHaveText("정상6");
  await expect(page.locator(".item-row")).toHaveCount(1);
});

test("curved flow, replayable feedback and a populated three-item queue", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".queue-empty")).toContainText(
    "아직 담긴 품목이 없습니다.",
  );
  await expect(page.locator(".queue-empty")).toBeInViewport();
  await page.screenshot({
    path: "test-results/workspace-empty.png",
    fullPage: true,
  });
  const add = page.getByRole("button", {
    name: "발주 목록에 추가",
    exact: true,
  });
  await expect(page.locator(".order-flow")).toHaveCount(0);
  await add.click();
  await expect(page.locator(".order-transfer")).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .getByTestId("queue-oat")
        .evaluate((node) => node.getAnimations().length),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".order-flow-path")).toHaveAttribute(
    "d",
    /M .+ C /,
  );
  await expect(page.locator(".order-flow-path")).toHaveCSS("opacity", "0.45");
  for (const name of ["바닐라 시럽", "테이크아웃 컵"]) {
    await page
      .locator(".item-row")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
    await add.click();
  }
  await expect(page.getByTestId("order-total")).toHaveText("77개");
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await page.locator(".item-row").filter({ hasText: "오트밀크" }).click();
  await page.getByRole("button", { name: "발주 목록에서 확인" }).click();
  await expect(page.locator(".order-transfer text")).toHaveText("8");
  await expect(page.locator(".order-transfer")).toHaveCount(0);
  await page.getByRole("button", { name: "발주 목록에서 확인" }).click();
  await expect(page.locator(".order-transfer")).toHaveCount(1);
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await expect(page.locator(".order-transfer")).toHaveCount(0);
  await page.getByRole("button", { name: "알림 닫기" }).click();
  await page.screenshot({
    path: "test-results/workspace-populated.png",
    fullPage: true,
  });
});

test("reduced-motion users keep order feedback without movement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "발주 목록에 추가", exact: true })
    .click();
  await expect(page.getByTestId("queue-oat")).toBeVisible();
  await expect(page.locator(".order-transfer")).toBeHidden();
  await expect(page.getByRole("status")).toContainText("발주 목록에 담았어요");
  expect(
    await page
      .getByTestId("queue-oat")
      .evaluate((node) => node.getAnimations().length),
  ).toBe(0);
});

test("connector represents only matching items through selection, removal and resize", async ({
  page,
}) => {
  await page.goto("/");
  const select = (name) =>
    page
      .locator(".item-row")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
  const flow = page.locator(".order-flow");
  const add = page.getByRole("button", {
    name: "발주 목록에 추가",
    exact: true,
  });
  await expect(flow).toHaveCount(0);
  await add.click();
  await expect(flow).toHaveAttribute("data-connected-id", "oat");
  await expect(page.getByTestId("queue-oat")).toHaveClass(/is-selected/);
  await select("하우스 블렌드 원두");
  await expect(flow).toHaveCount(0);
  await expect(page.locator(".queue-item.is-selected")).toHaveCount(0);
  await add.click();
  await expect(flow).toHaveAttribute("data-connected-id", "beans");
  await expect(flow).toHaveClass(/order-flow-feedback/);
  await expect(page.getByTestId("order-total")).toHaveText("20개");
  await select("오트밀크");
  await expect(flow).toHaveAttribute("data-connected-id", "oat");
  for (const width of [1280, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 1024) {
      await expect(flow).toHaveCount(0);
      continue;
    }
    await expect(flow).toBeVisible();
    await expect
      .poll(async () =>
        flow.evaluate((svg) => {
          const root = svg.getBoundingClientRect();
          const row = document
            .querySelector('[data-testid="queue-oat"]')
            .getBoundingClientRect();
          const button = document
            .querySelector(".add-order")
            .getBoundingClientRect();
          const path = svg.querySelector("path");
          const start = path.getPointAtLength(0),
            end = path.getPointAtLength(path.getTotalLength());
          return Math.max(
            Math.abs(root.left + start.x - button.right - 4),
            Math.abs(root.top + start.y - button.top - button.height / 2),
            Math.abs(root.left + end.x - row.left + 5),
            Math.abs(root.top + end.y - row.top - 26),
          );
        }),
      )
      .toBeLessThan(2);
  }
  await page
    .getByRole("button", { name: "오트밀크 발주 목록에서 삭제" })
    .click();
  await expect(flow).toHaveCount(0);
  await expect(page.locator(".queue-item.is-selected")).toHaveCount(0);
  await expect(
    page.locator(".suggested-body svg, .add-order svg, .create-order svg"),
  ).toHaveCount(0);
});

test("queue summary follows short lists and long lists scroll without false anchors", async ({
  page,
}) => {
  await page.goto("/");
  const add = page.getByRole("button", {
    name: "발주 목록에 추가",
    exact: true,
  });
  for (const name of [
    "오트밀크",
    "바닐라 시럽",
    "테이크아웃 컵",
    "하우스 블렌드 원두",
    "우유",
  ]) {
    await page
      .locator(".item-row")
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
    await add.click();
    const count = await page.locator(".queue-item").count();
    if (count <= 3) {
      const gap = await page
        .locator(".order-summary")
        .evaluate(
          (node) =>
            node.getBoundingClientRect().top -
            document.querySelector(".queue-list").getBoundingClientRect()
              .bottom,
        );
      expect(gap).toBeGreaterThanOrEqual(24);
      expect(gap).toBeLessThanOrEqual(32);
      expect(
        await page
          .locator(".queue-list")
          .evaluate((node) => node.scrollHeight - node.clientHeight),
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(
    await page
      .locator(".queue-list")
      .evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await page.locator(".queue-list").evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(page.locator(".order-flow")).toHaveCount(0);
  await page.locator(".queue-list").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(page.locator(".order-flow")).toHaveAttribute(
    "data-connected-id",
    "milk",
  );
});
