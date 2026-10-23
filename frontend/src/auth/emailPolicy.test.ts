import { describe, expect, it } from 'vitest'
import { checkEmail } from '@/auth/emailPolicy'

describe('emailPolicy', () => {
  it.each(['siddh@gmail.com', ' Siddh@Gmail.com ', 'a.b+tag@iitb.ac.in', 'x@ymail.com', 'x@mail.com', 'x@yahoo.in', 'x@abc.com'])(
    'accepts %j',
    (email) => {
      expect(checkEmail(email)).toBeNull()
    },
  )

  it.each(['abc', 'a@b', 'a@gmail', 'a b@gmail.com', 'a@@gmail.com', 'a@gmail..com', 'a@-gmail.com', 'a@gmail.c0m'])(
    'rejects malformed %j',
    (email) => {
      expect(checkEmail(email)).toEqual({ kind: 'format' })
    },
  )

  it.each([
    ['a@gmial.com', 'a@gmail.com'],
    ['a@gmail.con', 'a@gmail.com'],
    ['a@gmail.co', 'a@gmail.com'],
    ['a@gamil.com', 'a@gmail.com'],
    ['a@yaho.com', 'a@yahoo.com'],
    ['a@hotmial.com', 'a@hotmail.com'],
  ])('suggests a fix for %j', (email, suggestion) => {
    expect(checkEmail(email)).toEqual({ kind: 'typo', suggestion })
  })
})
