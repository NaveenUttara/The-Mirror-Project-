import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
    try {
        const { phone, otp, name, email } = await request.json();

        if (!phone || !otp) {
            return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 });
        }

        if (otp !== '123456') {
            return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
        }

        let userResult = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        let user;

        if (userResult.rows.length === 0) {
            // If new user, register them with Name and Email
            const newUserQuery = `
        INSERT INTO users (name, phone, email, phone_verified) 
        VALUES ($1, $2, $3, TRUE) RETURNING *;
      `;
            const newUserValues = [name || 'Citizen', phone, email || ''];

            // FIXED: changed newNutResult to userResult here
            userResult = await pool.query(newUserQuery, newUserValues);
            user = userResult.rows[0];
        } else {
            user = userResult.rows[0];
        }

      //  if (userResult.rows.length === 0) {
      //      const newUserQuery = `
      //  INSERT INTO users (name, phone, email, phone_verified) 
      //  VALUES ($1, $2, $3, TRUE) RETURNING *;
      //`;
      //      const newUserValues = [name || 'Citizen', phone, email || ''];
      //      const newNutResult = await pool.query(newUserQuery, newUserValues);
      //      user = newNutResult.rows[0];
      //  } else {
      //      user = userResult.rows[0];
      //  }

        const token = jwt.sign(
            { userId: user.id, phone: user.phone, role: user.role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        return NextResponse.json({
            success: true,
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, phone: user.phone, email: user.email }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}