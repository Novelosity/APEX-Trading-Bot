export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import {
  getCongressConfig,
  saveCongressConfig,
  getRecentDisclosures,
  getOpenMirrorPositions,
  getAllMirrorPositions,
} from '@/lib/storage'
import { encrypt, decrypt } from '@/lib/crypto'

export async function GET() {
  try {
    const session = await requireSession()
    const userId = session.userId

    const [config, disclosures, openPositions, allPositions] = await Promise.all([
      getCongressConfig(userId),
      getRecentDisclosures(30),
      getOpenMirrorPositions(userId),
      getAllMirrorPositions(userId, 20),
    ])

    // Mask API keys before returning
    const safeConfig = {
      ...config,
      alpacaApiKeyEnc: undefined,
      alpacaSecretKeyEnc: undefined,
      hasAlpacaKey: !!config.alpacaApiKeyEnc,
      alpacaKeyPreview: config.alpacaApiKeyEnc
        ? tryDecryptPreview(config.alpacaApiKeyEnc)
        : null,
    }

    // Compute stats
    const mtdPnl = allPositions
      .filter((p) => {
        const month = new Date().getMonth()
        return new Date(p.openedAt).getMonth() === month
      })
      .reduce((sum, p) => sum + (p.pnlUsd || 0), 0)

    const totalAllocation = openPositions.reduce((sum, p) => sum + p.allocationPct, 0)

    return NextResponse.json({
      success: true,
      data: {
        config: safeConfig,
        disclosures,
        openPositions,
        allPositions,
        stats: {
          activePositions: openPositions.length,
          totalAllocationPct: totalAllocation,
          mtdPnlUsd: mtdPnl,
          newDisclosures: disclosures.filter((d) => {
            const hours = (Date.now() - new Date(d.fetchedAt).getTime()) / 3600000
            return hours < 24
          }).length,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load congressional data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession()
    const userId = session.userId
    const body = await request.json()

    const current = await getCongressConfig(userId)

    const updated = { ...current }

    if (body.enabled !== undefined) updated.enabled = Boolean(body.enabled)
    if (body.alpacaMode) updated.alpacaMode = body.alpacaMode
    if (body.telegramBotToken !== undefined) updated.telegramBotToken = body.telegramBotToken || undefined
    if (body.telegramChatId !== undefined) updated.telegramChatId = body.telegramChatId || undefined
    if (body.maxAllocationPct !== undefined) updated.maxAllocationPct = Number(body.maxAllocationPct)
    if (body.positionSizePct !== undefined) updated.positionSizePct = Number(body.positionSizePct)
    if (body.stopLossPct !== undefined) updated.stopLossPct = Number(body.stopLossPct)
    if (body.trailingStopPct !== undefined) updated.trailingStopPct = Number(body.trailingStopPct)
    if (body.trailingStopTriggerPct !== undefined) updated.trailingStopTriggerPct = Number(body.trailingStopTriggerPct)
    if (body.maxDisclosureDelayDays !== undefined) updated.maxDisclosureDelayDays = Number(body.maxDisclosureDelayDays)
    if (body.minTradeValueUsd !== undefined) updated.minTradeValueUsd = Number(body.minTradeValueUsd)

    // Encrypt Alpaca keys if provided
    if (body.alpacaApiKey) updated.alpacaApiKeyEnc = encrypt(body.alpacaApiKey.trim())
    if (body.alpacaSecretKey) updated.alpacaSecretKeyEnc = encrypt(body.alpacaSecretKey.trim())

    // Clear keys if explicitly nulled
    if (body.alpacaApiKey === '') updated.alpacaApiKeyEnc = undefined
    if (body.alpacaSecretKey === '') updated.alpacaSecretKeyEnc = undefined

    updated.updatedAt = new Date().toISOString()

    await saveCongressConfig({ ...updated, userId })

    return NextResponse.json({
      success: true,
      data: {
        enabled: updated.enabled,
        alpacaMode: updated.alpacaMode,
        hasAlpacaKey: !!updated.alpacaApiKeyEnc,
        alpacaKeyPreview: updated.alpacaApiKeyEnc
          ? tryDecryptPreview(updated.alpacaApiKeyEnc)
          : null,
        telegramBotToken: updated.telegramBotToken,
        telegramChatId: updated.telegramChatId,
        maxAllocationPct: updated.maxAllocationPct,
        positionSizePct: updated.positionSizePct,
        stopLossPct: updated.stopLossPct,
        trailingStopPct: updated.trailingStopPct,
        trailingStopTriggerPct: updated.trailingStopTriggerPct,
        maxDisclosureDelayDays: updated.maxDisclosureDelayDays,
        minTradeValueUsd: updated.minTradeValueUsd,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update config'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

function tryDecryptPreview(enc: string): string | null {
  try {
    const plain = decrypt(enc)
    if (plain.length <= 8) return '●'.repeat(plain.length)
    return plain.slice(0, 4) + '●'.repeat(plain.length - 8) + plain.slice(-4)
  } catch {
    return null
  }
}
