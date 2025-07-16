let table;

/**
 * Shows or hides the login page
 * @param {boolean} visible - Show or hide the login page
 */

function setLogin(visible) {
    // #region Show/Hide Login
    const login = document.getElementById('login-area');
    const app = document.getElementById('app-area');
    if (visible) {
        login.style.display = 'block';
        app.style.display = 'none';
    } else {
        login.style.display = 'none';
        app.style.display = 'block';
    }
    // #endregion
}

document.addEventListener('DOMContentLoaded', () => {
    // #region page loaded

    fetch('/authenticate').then(response => {
        if (response.status === 401) {
            console.log('Not authenticated');
            setLogin(true);
        } else {
            console.log('Authenticated');
            setLogin(false);
        }

    });

    //initialize table
    table = new Tabulator('#table',
        {
            pagination: 'local',
            paginationSize: 15,
            columns: [
                { title: 'Job ID', field: 'id' },
                { title: 'Job Status', field: 'jobStatus' },
                { title: 'Completed Date', field: 'completedAt' },
                { title: 'Job Location Street', field: 'locationStreet' },
                { title: 'Job Location City', field: 'locationCity' },
                { title: 'Job Location State', field: 'locationState' },
                { title: 'Job Location Zip', field: 'locationZip' },
                { title: 'Total Cost', field: 'total' },
                { title: 'Customer ID', field: 'customerId' },
                { title: 'Customer Name', field: 'name' },
                { title: 'Customer Type', field: 'customerType' },
                { title: 'Customer Street', field: 'customerStreet' },
                { title: 'Customer City', field: 'customerCity' },
                { title: 'Customer State', field: 'customerState' },
                { title: 'Customer Zip', field: 'customerZip' },
                { title: 'Do Not Mail', field: 'doNotMail' }


            ] //create columns from data field names
        });

    // Trigger download
    document.getElementById('download-csv').addEventListener('click', function () {
        table.download('csv', 'data.csv');
    });
    document.getElementById('download-csv').disabled = true


    // #endregion
});

document.getElementById('login-btn').addEventListener('click', () => {
    // #region user clicks Login button
    const authCode = document.getElementById('auth_code').value;




    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ auth_code: authCode })
    })
        .then(response => {
            if (response.status === 401) {
                console.log('Unauthorized');
                setLogin(true);
                return;
            }
            setLogin(false);
            response.json()
        })
        .then(data => {
            console.log(data);
        });

    // #endregion
});

document.getElementById('fetch-btn').addEventListener('click', () => {
    // #region user clicks Get button

    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;


    const data = { startDate, endDate };

    // Show loading spinner
    document.getElementById('loading-spinner').style.display = 'flex';



    // Fetch job data from jobs endpoint
    fetch('/jobs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
        .then(response => response.json())
        .then(async jobsData => {
            const jobsArray = jobsData.data
            console.log(jobsArray)

            const formattedJobs = jobsArray.map(job => {
                job.completedAt = job.completedAt ? new Date(job.completedAt).toLocaleDateString() : '';
                job.locationStreet = `${job.property.address.street1} ${job.property.address.street2 ? `, ${job.property.address.street2}` : ''}`
                job.locationCity = job.property.address.city
                job.locationState = job.property.address.province
                job.locationZip = job.property.address.postalCode
                job.customerId = job.client.id
                job.name = job.client.name
                job.customerType = `${job.client.isCompany == true ? 'Commercial' : 'Residential'}`
                job.customerStreet = `${job.client.billingAddress.street1} ${job.client.billingAddress.street2 ? `, ${job.client.billingAddress.street2}` : ''}`
                job.customerCity = job.client.billingAddress.city
                job.customerState = job.client.billingAddress.province
                job.customerZip = job.client.billingAddress.postalCode
                return job
            })
            console.log(formattedJobs)

            // Put data into table
            table.setData(formattedJobs);

            // Hide loading spinner
            document.getElementById('loading-spinner').style.display = 'none';
            document.getElementById('download-csv').disabled = false
        })
        .catch(error => {
            console.error('There was a problem with the fetch operation:', error);
            // Hide loading spinner
            document.getElementById('loading-spinner').style.display = 'none';
        });
    // #endregion
});
