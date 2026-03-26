/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  /** Present for email OTP signup — show code with VANO branding instead of Supabase default mail */
  token?: string
}

const LOGO_URL = 'https://puomfwjtpvqedwxjxogh.supabase.co/storage/v1/object/public/email-assets/logo.png'

const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: 'hsl(217, 91%, 60%)',
  letterSpacing: '0.15em',
  margin: '0 0 24px',
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Welcome to {siteName} — confirm your email to get started
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt="VANO" width="48" height="48" style={logo} />
        <Heading style={h1}>Welcome to {siteName} 👋</Heading>
        <Text style={text}>
          You're one step away from finding local gigs and talent in Galway.
        </Text>
        {token ? (
          <>
            <Text style={text}>
              Enter this code on {siteName} to verify{' '}
              <Link href={`mailto:${recipient}`} style={link}>
                {recipient}
              </Link>
              :
            </Text>
            <Text style={codeStyle}>{token}</Text>
          </>
        ) : (
          <Text style={text}>
            Confirm your email (
            <Link href={`mailto:${recipient}`} style={link}>
              {recipient}
            </Link>
            ) to get started:
          </Text>
        )}
        <Button style={button} href={confirmationUrl}>
          {token ? `Open ${siteName}` : 'Get Started'}
        </Button>
        <Text style={footer}>
          Didn't sign up for {siteName}? Just ignore this email — no action needed.{' '}
          <Link href={siteUrl} style={link}>
            {siteName}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 32px' }
const logo = { borderRadius: '12px', marginBottom: '24px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: 'hsl(220, 20%, 10%)',
  margin: '0 0 16px',
}
const text = {
  fontSize: '15px',
  color: 'hsl(215, 16%, 47%)',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const link = { color: 'hsl(217, 91%, 60%)', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(217, 91%, 60%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '13px', color: '#999999', margin: '32px 0 0' }
