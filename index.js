const superAgent = require('superagent');
const fs = require('fs');
const https = require('https');
const _ = require('underscore');

// login to Sina Weibo, open someone's page, click `album`
// url would be `http://weibo.com/p/${OID}/photos?from=page_100505&mod=TAB#place`
// the ${OID} part is the OID
const OID = '';

// how to get your cookie
// 1. get into the page above when getting OID
// 2. open DevTools (press 'F12' on Windows or 'option+command+i' on Mac, make sure you are not using old IEs)
// 3. select 'Network' tab, in Filter choose 'XHR', then reload the page
// 4. there will be one or more links shown in the left panel, choose one
// 5. in the right panel `Headers` tab, you will see a parameter named 'Cookie'
// 6. copy and paste it below as a string
const COOKIE = '';

// the image quality you want to download
// attention: original image will be used when it's
// low dimension and not big enough to fit the given size
// there are 5 options
// 'thumb150' stands for 150 * 150
// 'thumb300' stands for 300 * 300
// 'mw690' stands for 690 * x
// 'mw1024' stands for 1024 * x
// 'large' stands for original image
const Quality = 'large';

// the file types you want to download
const FILE_TYPES = ['jpg', 'png'];

// max download count in the same time
// prefer less than 10
const Download_Max_Count = 10;

// if download was too slow
// cost more than this time (milliseconds)
// will restart downloading
const Download_Timeout = 10000;


// check if there was `images` folder,
// if not, create it
try {
    fs.statSync('./images');
} catch (e) {
    fs.mkdirSync('./images');
}

// check if there was `images/OID` folder,
// if not, create it
try {
    fs.statSync('./images/' + OID);
} catch (e) {
    fs.mkdirSync('./images/' + OID);
}

let imageList;
let LastMid = '';
let currentPage = 1;
const params = {
    'ajwvr': 6,
    'filter': 'wbphoto|||v6',
    'page': 0,
    'count': 20,
    'module_id': 'profile_photo',
    'oid': OID,
    'uid': '',
    'lastMid': LastMid,
    'lang': 'zh-cn',
    '_t': 1,
    'callback': 'imageListLoader'
};

// current image index in imageList
let currentIndex = -1;
// current downloading image count
let downloadingCount = 0;

const downloadHelper = function (newPage) {
    // called by getPage
    if (newPage) {
        currentIndex = -1;
    }

    currentIndex++;
    // current page download finish
    if (currentIndex >= imageList.length || downloadingCount >= Download_Max_Count) return;

    downloadingCount++;
    downloadImage(imageList[currentIndex]);
};

const nextImage = function () {
    downloadingCount--;

    if (downloadingCount === 0 && currentIndex >= imageList.length - 1) {
        currentPage++;
        getPage(currentPage);
    } else {
        downloadHelper();
    }
};

const downloadImage = function (filename, count = 0) {
    if (count >= 5) {
        console.warn(`try downloading file: ${filename} more than 5 times, skip it`);
        nextImage();
        return;
    }

    try {
        // check if image already exists
        fs.statSync(`./images/${OID}/${filename}`);

        console.info(`file already exists, skip image: ${filename}`);
        nextImage();
    } catch (e) {
        console.log(`start downloading image: ${filename}`);

        const request = https.get(`https://wx${_.random(1, 4)}.sinaimg.cn/${Quality}/${filename}`, function (res) {
            let imgData = '';

            res.setEncoding('binary');

            res.on('data', function (chunk) {
                imgData += chunk;
            }).on('end', function () {
                try {
                    fs.writeFileSync(`./images/${OID}/${filename}`, imgData, 'binary');
                    console.log(`download complete: ${filename}`);
                } catch (e) {
                    console.error(`save image failed: ${filename}`);
                } finally {
                    nextImage();
                }
            });
        });

        request.setTimeout(Download_Timeout, function () {
            // retry
            console.warn(`download timeout, start retry : ${filename}`);
            downloadImage(filename, count + 1);
        });
    }
};

const RP = new RegExp(`cmw218\/(.+?\.(${FILE_TYPES.join('|')}))`);
const imageListLoader = function (json) {
    LastMid = json.data.lastMid;
    imageList = json.data.html.map(html => html.match(RP)).filter(arr => !!arr).map(arr => arr[1]);
};

const getPage = function (page) {
    params.page = page;
    params.lastMid = LastMid;

    superAgent
        .get('http://photo.weibo.com/page/waterfall')
        .set('Cookie', COOKIE)
        .query(params)
        .timeout({
            response: 5000,
            deadline: 10000
        })
        .end((err, res) => {
            if (err) {
                console.error(`----- page loading failed id: ${page} -----`);
                console.warn(`----- trying reload -----`);
                getPage(page);
            } else {
                console.log(`----- page loaded id: ${page} -----`);
                eval(res.text);

                if (imageList.length === 0) {
                    currentPage++;
                    getPage(currentPage);
                    return;
                }

                for (let i = 0; i < Download_Max_Count; i++) {
                    downloadHelper(!i);
                }
            }
        });
};

if (!OID) {
    console.error('please specify an `OID` and try again');
    return;
}

if (!COOKIE) {
    console.error('please specify `COOKIE` and try again');
    return;
}

getPage(currentPage);
