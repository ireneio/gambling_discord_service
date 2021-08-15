import { MessageBuilder } from 'discord-webhook-node'
import { bulkSendMessage } from '../discord/webhook'
import { CrawlerReturnObject, filterDuplicate, screenshotAndUpdateUrl } from './helper'
import { brandLogo, imgDefault } from './constants'

interface CrawlerInput {
  browser: any,
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

// const vh = 1080
// const vw = 1920

export default async function crawler({ browser, queryBrand, limit, webhookUrl, crawlerName, siteBrand }: CrawlerInput): Promise<{ status: boolean, identifier: string, message: string }> {
  const locale = {
    full: queryBrand === 'jp' ? 'ja-JP' : 'en-US',
    abbrv: queryBrand === 'jp' ? 'ja' : 'en',
  }

  try {
    const page = await browser.newPage()

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

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight)
    })

    let list = await page.evaluate(() => {
      function pageLogic(element: Element) {
        const a = element.querySelector('.product-card__link-overlay')
        const url = `${a?.getAttribute('href')}`
        const title = `${a?.textContent}`
        const price = `${element?.querySelector('.is--current-price')?.textContent}`
        const img = `${element.querySelector('img')?.getAttribute('src')}`

        return {
          title,
          url,
          price,
          img
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

    if (list.length > 0) {
      await screenshotAndUpdateUrl(page, list)
      console.log(list)
      await page.close()
      const messageList: MessageBuilder[] = []
      list.forEach((item: any, index: number) => {
        const { url, price, title, img } = item
        const authorText = `${siteBrand}_${queryBrand}`.toUpperCase()
        const _img = img === 'undefined' ? imgDefault : img
        const embed = new MessageBuilder()
          .setTitle(title)
          .setAuthor(`${authorText} [Search: New Shoes]`, brandLogo.nike, baseUrl)
          // @ts-ignore
          .setURL(url)
          .addField('價格', price, true)
          .setFooter(`最新 ${index + 1}/${limit} 筆`)
          .setImage(_img)
          .setTimestamp()
        messageList.push(embed)
      })
      await bulkSendMessage(messageList, webhookUrl)
    } else {
      await page.close()
      console.log(`${siteBrand}-${crawlerName}: No New Drops`)
    }

    return { status: true, identifier: `${siteBrand}-${crawlerName}`, message: 'success' }
  } catch (e) {
    console.log('ERROR:', e.message)
    return { status: false, identifier: `${siteBrand}-${crawlerName}`, message: e.message }
  }
}
