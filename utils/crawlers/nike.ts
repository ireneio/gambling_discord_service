import { MessageBuilder } from 'discord-webhook-node'
import { bulkSendMessage } from '../discord/webhook'
import puppeteer from 'puppeteer'
import { isHeadless } from '../puppeteer'
import { CrawlerReturnObject, filterDuplicate } from './helper'
import { brandLogo } from './constants'

interface CrawlerInput {
  queryBrand: 'jp' | 'us',
  limit: number,
  webhookUrl: string,
  crawlerName: string,
  siteBrand: 'nike'
}

let previousEnList: CrawlerReturnObject[] = []
let previousJpList: CrawlerReturnObject[] = []

const vh = 812
const vw = 375

export default async function crawler({ queryBrand, limit, webhookUrl, crawlerName, siteBrand }: CrawlerInput): Promise<{ status: boolean, identifier: string }> {
  const locale = {
    full: queryBrand === 'jp' ? 'ja-JP' : 'en-US',
    abbrv: queryBrand === 'jp' ? 'ja' : 'en',
  }

  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: [
      `--window-size=${vw},${vh}`,
      `--lang=${locale.full},${locale.abbrv}`
    ],
  })
  try {
    const [page] = await browser.pages()

    await page.setViewport({
      width: vw,
      height: vh,
    })

    const host = 'https://www.nike.com'
    const pathPrepend = queryBrand === 'jp' ? `/${queryBrand}` : ''
    const baseUrl = `${host}${pathPrepend}/w/new-shoes-3n82yzy7ok?sort=newest`

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        get: function () {
          return locale.full
        }
      })
      Object.defineProperty(navigator, 'languages', {
        get: function () {
          return [locale.full, locale.abbrv]
        }
      })
    })

    await page.setExtraHTTPHeaders({
      'Accept-Language': locale.abbrv
    })

    await page.goto(baseUrl, { waitUntil: 'networkidle0' })

    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (request.resourceType() === 'image') request.abort()
      else request.continue()
    })

    let list = await page.evaluate(() => {
      function pageLogic(element: Element) {
        const a = element.querySelector('.product-card__link-overlay')
        const url = `${a?.getAttribute('href')}`
        const title = `${a?.textContent}`
        const price = `${element?.querySelector('.is--current-price')?.textContent}`

        return {
          title,
          url,
          price
        }
      }

      const map = Array.from(
        document.querySelectorAll('.product-card__body'),
        pageLogic
      )
      return map
    })
    list = list.slice(0, limit)

    if (queryBrand === 'jp') {
      const _list = filterDuplicate(list, previousJpList)
      previousJpList = [...list]
      list = _list
    } else if (queryBrand === 'us') {
      const _list = filterDuplicate(list, previousEnList)
      previousEnList = [...list]
      list = _list
    }

    console.log(list)

    const messageList: MessageBuilder[] = []

    list.forEach((item: any, index: number) => {
      const { url, price, title } = item
      const authorText = `${siteBrand}_${queryBrand}`.toUpperCase()
      const embed = new MessageBuilder()
        .setTitle(title)
        .setAuthor(`${authorText} [Search: New Shoes]`, brandLogo.nike, baseUrl)
        // @ts-ignore
        .setURL(url)
        .addField('價格', price, true)
        .setFooter(`最新 ${index + 1}/${limit} 筆`)
        .setTimestamp()
      messageList.push(embed)
    })

    await bulkSendMessage(messageList, webhookUrl)

    return { status: true, identifier: `${siteBrand}-${crawlerName}` }
  } catch (e) {
    console.log('ERROR:', e.message)
    return { status: false, identifier: `${siteBrand}-${crawlerName}` }
  } finally {
    await browser.close()
  }
}