const superAgent = require('superagent');
const fs = require('fs');
const http = require('http');

// login to Sina Weibo, open someone's page
// url would be `http://weibo.com/u/${UID}?topnav=1&wvr=6&topsug=1&is_all=1`
// the ${UID} part is the UID, should be a number or a custom string
const UID = '';

// how to get your cookie
// 1. open `http://photo.weibo.com/`
// 2. open DevTools (press 'F12' on Windows or 'option+command+i' on Mac, make sure you are not using old IEs)
// 3. select 'Network' tab, in Filter choose 'XHR', then reload the page
// 4. there will be one or more links shown in the left panel, choose one
// 5. in the right panel `Headers` tab, you will see a parameter named 'Cookie'
// 6. copy and paste it below as a string
const COOKIE = '';

// the quality of images you want to download
// there are 5 options
// 'thumb150' stands for 150 * 150
// 'thumb300' stands for 300 * 300
// 'mw690' stands for 690 * x
// 'mw1024' stands for 1024 * x
// 'large' stands for original image

// note: original image will be used when it's
// low dimension and not large enough to fit the given size
const Quality = 'large';

// max download count in the same time
// prefer less than 10
const Download_Max_Count = 10;

// if download was too slow
// which means it costs more than this time (milliseconds)
// will restart downloading
const Download_Timeout = 10000;


// check if there was `images` folder,
// if not, create it
try {
    fs.statSync('./images');
} catch (e) {
    fs.mkdirSync('./images');
}

// check if there was `images/UID` folder,
// if not, create it
try {
    fs.statSync('./images/' + UID);
} catch (e) {
    fs.mkdirSync('./images/' + UID);
}

let imageList, imageTotalList;
let currentPage = 1;
const countPerPage = 20;
let saveFailedCount = 0;

// current image index in imageList
let currentIndex = -1;
// current downloading image count
let downloadingCount = 0;

const downloadHelper = (newPage = false) => {
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

const nextImage = () => {
    downloadingCount--;

    if (downloadingCount === 0 && currentIndex >= imageList.length - 1) {
        currentPage++;
        getPage(currentPage);
    } else {
        downloadHelper();
    }
};

const downloadImage = (image, count = 0) => {
    if (count >= 5) {
        console.warn(`try downloading file: ${image.name} more than 5 times, skip it`);
        nextImage();
        return;
    }

    try {
        // check if image already exists
        fs.statSync(`./images/${UID}/${image.name}`);

        console.info(`file already exists, skip image: ${image.name}`);
        nextImage();
    } catch (e) {
        console.log(`start downloading image: ${image.name}`);

        const request = http.get(image.url, res => {
            let imgData = '';

            res.setEncoding('binary');

            res.on('data', chunk => {
                imgData += chunk;
            }).on('end', () => {
                try {
                    fs.writeFileSync(`./images/${UID}/${image.name}`, imgData, 'binary');
                    console.log(`download complete: ${image.name}`);
                } catch (e) {
                    saveFailedCount++;
                    console.error(`save image failed: ${image.name}`);
                } finally {
                    nextImage();
                }
            });
        });

        request.setTimeout(Download_Timeout, () => {
            // retry
            console.warn(`download timeout, start retry : ${image.name}`);
            downloadImage(image, count + 1);
        });
    }
};

const getPage = page => {
    const ids = imageTotalList.slice((page - 1) * countPerPage, page * countPerPage).join(',');

    // download finish
    if (!ids) {
        console.log(`----- download finish, save failed ${saveFailedCount} -----`);
        return;
    }

    superAgent
        .get('http://photo.weibo.com/photos/get_multiple')
        .set('Cookie', COOKIE)
        .query({uid: UID, ids, type: 3, __rnd: Date.now()})
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

                const data = res.body.data;
                imageList = [];

                for (let i in data) {
                    if (data.hasOwnProperty(i)) {
                        // data[i] could be null sometimes
                        if (!data[i]) {
                            continue;
                        }

                        // slice(0, -2) to clear the last two '\u200'
                        // handle caption with link, remove it
                        // handle caption with enter, change it into space
                        // handle caption with illegal character which can't be used in file name, remove it
                        // handle caption too long, use first 50 characters
                        // handle multiple images with the same caption, add last two number of photo_id
                        imageList.push({
                            name: data[i].caption_render.slice(0, -2).replace(/http:\/\/.+/, '').replace(/\n/g, ' ').replace(/[\\\/:*?"<>|]/g, '').substr(0, 50) + '_' + (data[i].photo_id % 100) + data[i].pic_name.match(/\.(.+)$/)[0],
                            url: `${data[i].pic_host}/${Quality}/${data[i].pic_name}`
                        });
                    }
                }

                for (let i = 0; i < Download_Max_Count; i++) {
                    downloadHelper(!i);
                }
            }
        });
};

const getImageList = () => {
    console.log('----- load image list -----');
    superAgent
        .get('http://photo.weibo.com/photos/get_photo_ids')
        .set('Cookie', COOKIE)
        .query({
            uid: UID, album_id: 0, type: 3, __rnd: Date.now()
        })
        .timeout({
            response: 5000,
            deadline: 10000
        })
        .end((err, res) => {
            if (err) {
                console.error(`----- load image list failed -----`);
                console.warn(`----- trying reload -----`);
                getImageList();
            } else {
                imageTotalList = res.body.data;
                console.info(`----- load image list complete, ${imageTotalList.length} images ready to download -----`);
                getPage(currentPage);
            }
        });
};

if (!UID) {
    console.error('please specify an `UID` and try again');
    return;
}

if (!COOKIE) {
    console.error('please specify `COOKIE` and try again');
    return;
}

getImageList();
