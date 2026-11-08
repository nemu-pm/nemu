import { describe, expect, it } from 'bun:test'
import { resolveAuthReturnUrl } from './auth-resume'

const origin = 'https://nemu.pm'
const stored = (path: string, resume?: string) => JSON.stringify({ path, resume })

describe('resolveAuthReturnUrl', () => {
  it('moves the one-time token onto the remembered path', () => {
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, stored('/library/abc', 'metadata-match'))).toEqual({
      url: '/library/abc?ott=tok',
      resume: 'metadata-match',
    })
  })

  it('keeps encoded ids, the query and the hash', () => {
    const path = '/read/aidoku%3Asrc/manga%2F1?page=3#top'
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, stored(path))?.url).toBe(
      '/read/aidoku%3Asrc/manga%2F1?page=3&ott=tok#top',
    )
  })

  it('does nothing without a token, since the sign-in did not complete', () => {
    expect(resolveAuthReturnUrl(`${origin}/library`, stored('/library/abc'))).toBeNull()
  })

  it('does nothing when nothing was remembered', () => {
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, null)).toBeNull()
  })

  it('never leaves the origin or trusts a malformed value', () => {
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, stored('//evil.example/x'))).toBeNull()
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, stored('/\\evil.example/x'))).toBeNull()
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, stored('https://evil.example/x'))).toBeNull()
    expect(resolveAuthReturnUrl(`${origin}/?ott=tok`, 'not json')).toBeNull()
  })
})
