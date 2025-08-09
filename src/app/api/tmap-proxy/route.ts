import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('u')
  if (!url) return new NextResponse('Missing u', { status: 400 })
  try {
    const upstream = await fetch(url)
    const body = await upstream.arrayBuffer()
    const res = new NextResponse(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/javascript',
        'Cache-Control': 'no-store'
      }
    })
    return res
  } catch (e) {
    return new NextResponse('Proxy error', { status: 502 })
  }
}


