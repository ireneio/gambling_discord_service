import { MessageBuilder } from 'discord-webhook-node'
import { bulkSendMessage } from '../discord/webhook'
import puppeteer from 'puppeteer'
import { isHeadless } from '../puppeteer'
import { CrawlerReturnObject, filterDuplicate } from './helper'
import { brandLogo } from './constants'

interface CrawlerInput {
  queryBrand: 'us',
  limit: number,
  webhookUrl: string,
  crawlerName: string,
  siteBrand: 'newbalance'
}

let previousEnList: CrawlerReturnObject[] = []

const vh = 812
const vw = 375

export default async function crawler({ queryBrand, limit, webhookUrl, crawlerName, siteBrand }: CrawlerInput): Promise<{ status: boolean, identifier: string }> {
  const browser = await puppeteer.launch({
    headless: isHeadless,
    args: [
      `--window-size=${vw},${vh}`,
    ],
  })
  try {
    const [page] = await browser.pages()

    await page.setViewport({
      width: vw,
      height: vh,
    })

    const host = 'https://www.newbalance.com'
    const baseUrl = `${host}/new/?prefn1=productClass&prefv1=Shoes&srule=New%20Arrivals#`

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', {
        get: function () {
          return 'en-US'
        }
      })
      Object.defineProperty(navigator, 'languages', {
        get: function () {
          return ['en-US', 'en']
        }
      })
    })

    await page.goto(baseUrl, { waitUntil: 'networkidle0' })

    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (request.resourceType() === 'image') request.abort()
      else request.continue()
    })

    await page.waitForXPath('//a[@id="continue-country"]', { visible: true })
    await page.click('a[id="continue-country"]')

    let list = await page.evaluate(() => {
      function pageLogic(element: Element) {
        const a = element.querySelector('.link.font-weight-bold.pname.text-underline.no-underline-lg')
        const url = `${a?.getAttribute('href')}`
        const title = `${a?.textContent}`
        const price = `${element.querySelector('.price-value')?.children[0].textContent}`

        return {
          title,
          url,
          price: price?.replaceAll('\n', '')
        }
      }

      const map = Array.from(
        document.querySelectorAll('.row.pgp-grid.pb-2.pr-2'),
        pageLogic
      )
      return map
    })
    list = list.slice(0, limit)

    const _list = filterDuplicate(list, previousEnList)
    previousEnList = [...list]
    list = _list

    console.log(list)

    const messageList: MessageBuilder[] = []

    list.forEach((item: any, index: number) => {
      const { url, price, title } = item
      const authorText = `${siteBrand}_${queryBrand}`.toUpperCase()
      const embed = new MessageBuilder()
        .setTitle(title)
        .setAuthor(`${authorText} [Search: New NB Gear]`, brandLogo.newBalance, baseUrl)
        // @ts-ignore
        .setURL(`${host}${url}`)
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
