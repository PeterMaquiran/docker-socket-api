import { Request, Response, NextFunction } from 'express'

export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  const apiKey = authHeader && authHeader.split(' ')[1] // Extract "Bearer <token>"

  const EXPECTED_KEY = process.env.API_SECRET_KEY

  if (!EXPECTED_KEY) {
    console.error('API_SECRET_KEY environment variable is not configured')

    return res.status(500).json({
      error: 'Internal Server Error',
    })
  }

  if (!apiKey || apiKey !== EXPECTED_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' })
  }

  next()
}
