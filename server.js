const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;
require('dotenv').config();
const appKey = process.env.APP_KEY;
const cookieParser = require('cookie-parser');


app.use(express.static('public'));
app.use(express.json()); //middleware to pull json out of the request
app.use(cookieParser()); //middleware to parse cookies

const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";

const CLIENT_ID = process.env.JOBBER_CLIENT_ID;
const CLIENT_SECRET = process.env.JOBBER_CLIENT_SECRET;


const checkAndRefreshToken = async (req, res, next) => {
    // #region Middleware to check and refresh token
    const accessToken = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;

    if (!accessToken) {
        return res.status(401).json({ message: 'Access token missing' });
    }

    try {
        const decoded = jwt.decode(accessToken);
        if (!decoded || !decoded.exp) {
            throw new Error('Invalid token structure');
        }

        const now = Math.floor(Date.now() / 1000);

        // If access token expires in less than 5 minutes, refresh it
        if ((decoded.exp - now) < 300) {
            if (!refreshToken) {
                return res.status(401).json({ message: 'Refresh token missing' });
            }

            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            });

            const response = await fetch(JOBBER_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            const data = await response.json();
            if (!data.access_token) {
                console.error('Token refresh failed:', data);
                return res.status(401).json({ message: 'Token refresh failed' });
            }

            // Update cookies with new tokens
            res.cookie('access_token', data.access_token, {
                httpOnly: true,
                secure: true,
                maxAge: data.expires_in * 1000
            });

            if (data.refresh_token) {
                res.cookie('refresh_token', data.refresh_token, {
                    httpOnly: true,
                    secure: true
                });
            }

            console.log('Token refreshed');
        }

        next(); // Allow route to proceed
    } catch (err) {
        console.error('Error validating token:', err);
        return res.status(401).json({ message: 'Token invalid or expired' });
    }
    // #endregion
};


app.post('/login', async (req, res) => {
    // #region POST /login
    const authCode = req.body.auth_code;
    console.log('Received auth code:', authCode);
    if (!authCode) {
        return res.status(400).json({ message: 'Auth code is required' });
    }

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: "https://www.themailshark.com/"
    });

    try {
        const response = await fetch(JOBBER_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        const data = await response.json();


        console.log('Token exchange successful:', data);
        if (!data.access_token) {
            console.error('Token exchange failed:', data);
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Store access token securely (cookie or DB)
        res.cookie('access_token', data.access_token, {
            httpOnly: true,
            secure: true, // Use true in production (HTTPS)
            maxAge: 3600000 // 1 hour
        });
        console.log('Access token set in cookie:', data.access_token);

        res.cookie('refresh_token', data.refresh_token, {
            httpOnly: true,
            secure: true
        });
        console.log('Refresh token set in cookie:', data.refresh_token);

        return res.status(200).json({ message: 'Login successful' });
    } catch (err) {
        console.error('Error during token exchange:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
    // #endregion
});

app.get('/authenticate', (req, res) => {
    // #region GET /authenticate
    const accessToken = req.headers.cookie;
    if (!accessToken) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    res.json({ message: 'Success' });
    // #endregion
});

app.post('/jobs', checkAndRefreshToken, async (req, res) => {
    // #region POST /jobs
    const startDate = new Date(req.body.startDate).toISOString();
    const endDate = new Date(req.body.endDate).toISOString();
    const accessToken = req.cookies.access_token;

    if (!accessToken) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    let hasNextPage = true;
    let afterCursor = null;
    const allJobs = [];

    try {
        while (hasNextPage) {
            const query = `
                query Jobs($after: String) {
                    jobs(
                        filter: {
                            completedAt: { before: "${endDate}", after: "${startDate}" }
                        },
                        first: 20,
                        after: $after
                    ) {
                        totalCount
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            completedAt
                            createdAt
                            endAt
                            id
                            invoicedTotal
                            jobNumber
                            jobStatus
                            jobType
                            startAt
                            title
                            total
                            uninvoicedTotal
                            updatedAt
                            client {
                                companyName
                                firstName
                                id
                                isCompany
                                lastName
                                updatedAt
                                billingAddress {
                                    city
                                    country
                                    name
                                    postalCode
                                    province
                                    street
                                    street1
                                    street2
                                }
                                title
                                name
                            }
                            property {
                                address {
                                    city
                                    country
                                    postalCode
                                    province
                                    street
                                    street1
                                    street2
                                }
                            }
                        }
                    }
                }`;

            const variables = {
                after: afterCursor || null
            };

            const response = await fetch('https://api.getjobber.com/api/graphql', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-JOBBER-GRAPHQL-VERSION': '2025-01-20'
                },
                body: JSON.stringify({ query, variables })
            });

            const result = await response.json();


            // Log GraphQL errors if present
            if (result.errors) {
                console.error('GraphQL errors:', result.errors);
                throw new Error(result.errors[0].message || 'GraphQL error');
            }

            if (!result.data || !result.data.jobs) {
                console.error('Unexpected GraphQL response:', result);
                throw new Error('Malformed GraphQL response');
            }
            if (response.status === 401 || result.errors?.some(e => e.message.includes("Unauthorized"))) {
                throw new Error('Unauthorized');
            }

            const jobData = result.data.jobs;
            allJobs.push(...jobData.nodes);
            hasNextPage = jobData.pageInfo.hasNextPage;
            afterCursor = jobData.pageInfo.endCursor;
        }

        res.json({ data: allJobs });
    } catch (error) {
        console.error('Error fetching jobs:', error.message);
        if (error.message === 'Unauthorized') {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        res.status(500).json({ message: 'Internal Server Error' });
    }
    // #endregion
});



app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});

