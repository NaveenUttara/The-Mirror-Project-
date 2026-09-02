import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import oracledb from 'oracledb';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

type OtpRow = {
    otpHash: string;
    expiresAt: Date;
};

type UserRow = {
    id: number | string;
    name: string;
    phone: string;
    email: string | null;
    role: string | null;
};

function isValidOtp(otp: string, storedValue: string): boolean {
    const [storedHash, salt] = storedValue.split(':');

    if (!storedHash || !salt) {
        return false;
    }

    const submittedHash = crypto.scryptSync(otp, salt, 64);
    const storedHashBuffer = Buffer.from(storedHash, 'hex');

    return storedHashBuffer.length === submittedHash.length
        && crypto.timingSafeEqual(storedHashBuffer, submittedHash);
}

export async function POST(request: Request) {
    try {
        const { phone, otp, name, email } = await request.json();
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedEmail = typeof email === 'string' ? email.trim() : '';

        if (!phone || !otp) {
            return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 });
        }

        const connection = await getConnection();
        let user: UserRow;

        try {
            const otpResult = await connection.execute<OtpRow>(
                `SELECT otp_hash AS "otpHash", expires_at AS "expiresAt"
                   FROM (
                       SELECT otp_hash, expires_at
                         FROM MIRROR_OTP_REQUESTS
                        WHERE phone = :phone
                        ORDER BY expires_at DESC
                   )
                  WHERE ROWNUM = 1`,
                { phone },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const otpRecord = otpResult.rows?.[0];

            if (
                !otpRecord
                || new Date(otpRecord.expiresAt).getTime() <= Date.now()
                || !isValidOtp(String(otp), otpRecord.otpHash)
            ) {
                return NextResponse.json(
                    { error: 'Invalid or expired OTP' },
                    { status: 400 }
                );
            }

            const findUser = async () => {
                const result = await connection.execute<UserRow>(
                    `SELECT id AS "id",
                            name AS "name",
                            phone AS "phone",
                            email AS "email",
                            role AS "role"
                       FROM MIRROR_USERS
                      WHERE phone = :phone`,
                    { phone },
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                return result.rows?.[0];
            };

            const existingUser = await findUser();
            const profileIsIncomplete = !existingUser
                || !existingUser.name.trim()
                || existingUser.name.trim().toLowerCase() === 'citizen';

            if (existingUser && !profileIsIncomplete) {
                user = existingUser;
            } else {
                if (!normalizedName) {
                    return NextResponse.json({
                        success: true,
                        profileRequired: true,
                        message: 'OTP verified. Complete your profile to continue.',
                    });
                }

                if (normalizedName.length > 150) {
                    return NextResponse.json(
                        { error: 'Name must be 150 characters or fewer' },
                        { status: 400 }
                    );
                }

                if (
                    normalizedEmail
                    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
                ) {
                    return NextResponse.json(
                        { error: 'Enter a valid email address or leave it blank' },
                        { status: 400 }
                    );
                }

                if (existingUser) {
                    await connection.execute(
                        `UPDATE MIRROR_USERS
                            SET name = :name,
                                email = :email,
                                updated_at = SYSTIMESTAMP
                          WHERE id = :id`,
                        {
                            name: normalizedName,
                            email: normalizedEmail || null,
                            id: existingUser.id,
                        }
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO MIRROR_USERS
                            (id, name, phone, email, phone_verified)
                         VALUES
                            (MIRROR_USERS_SEQ.NEXTVAL, :name, :phone, :email, 1)`,
                        {
                            name: normalizedName,
                            phone,
                            email: normalizedEmail || null,
                        }
                    );
                }

                const createdUser = await findUser();

                if (!createdUser) {
                    throw new Error('User was created but could not be loaded');
                }

                user = createdUser;
            }

            await connection.execute(
                'DELETE FROM MIRROR_OTP_REQUESTS WHERE phone = :phone',
                { phone }
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            await connection.close();
        }

        const jwtSecret = process.env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('Missing required environment variable: JWT_SECRET');
        }

        const token = jwt.sign(
            { userId: user.id, phone: user.phone, role: user.role },
            jwtSecret,
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
