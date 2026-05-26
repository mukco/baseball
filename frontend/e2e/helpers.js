import { expect } from '@playwright/test'
import { format, subDays } from 'date-fns'

/**
 * Wait for game cards to finish loading on the Today page.
 * Returns the card locator once at least one is visible.
 */
export async function waitForCards(page) {
  const cards = page.locator('.card')
  await expect(cards.first()).toBeVisible({ timeout: 10000 })
  return cards
}

/**
 * Fill the date input and wait for the page to re-render with new data.
 * date should be a 'yyyy-MM-dd' string.
 */
export async function navigateToDate(page, date) {
  const input = page.locator('input[type="date"]')
  await input.fill(date)
  await input.press('Tab')
}

/**
 * Returns a date string N days in the past, formatted for the date input.
 */
export function daysAgo(n) {
  return format(subDays(new Date(), n), 'yyyy-MM-dd')
}
