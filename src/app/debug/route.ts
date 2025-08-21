import { NextResponse } from 'next/server'

export async function GET() {
  const tmapKey = process.env.NEXT_PUBLIC_TMAP_API_KEY
  const nodeEnv = process.env.NODE_ENV
  
  return NextResponse.json({
    nodeEnv,
    tmapKeyExists: !!tmapKey,
    tmapKeyLength: tmapKey?.length || 0,
    tmapKeyPrefix: tmapKey?.substring(0, 8) || 'none',
    allEnvKeys: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_')),
    timestamp: new Date().toISOString()
  })
}
