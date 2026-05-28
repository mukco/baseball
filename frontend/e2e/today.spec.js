import { test, expect } from '@playwright/test'
import { waitForCards, navigateToDate, daysAgo } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('navbar renders', async ({ page }) => {
  const nav = page.locator('nav')
  await expect(nav).toBeVisible()
})

test('game cards appear on load', async ({ page }) => {
  await waitForCards(page)
})

test('previous date button changes the date', async ({ page }) => {
  const input = page.locator('input[type="date"]')
  const before = await input.inputValue()

  // The date nav row is the grandparent of the date input; prev is its first button
  const dateNavRow = input.locator('xpath=../..')
  await dateNavRow.locator('button').first().click()

  const after = await input.inputValue()
  expect(after).not.toBe(before)
  expect(after < before).toBeTruthy()
})

test('"Back to today" link appears after navigating to a past date', async ({ page }) => {
  await navigateToDate(page, daysAgo(3))
  await expect(page.getByText('Back to today')).toBeVisible()
})

test('"Back to today" returns to current date', async ({ page }) => {
  const input = page.locator('input[type="date"]')
  await navigateToDate(page, daysAgo(3))
  await page.getByText('Back to today').click()
  const value = await input.inputValue()
  // Use Intl to get local date (not UTC) matching what the app uses
  const today = new Intl.DateTimeFormat('en-CA').format(new Date())
  expect(value).toBe(today)
})
