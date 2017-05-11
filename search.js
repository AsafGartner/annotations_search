if (location.hash && location.hash.length > 0) {
    var initialQuery = location.hash;
    if (initialQuery[0] == "#") {
        initialQuery = initialQuery.slice(1);
    }
    document.getElementById("query").value = decodeURIComponent(initialQuery);
}


var fileListsToLoad = 0;
var fileListsLoaded = 0;

var itemsToLoad = 0;
var itemsLoaded = 0;
var lastEpisodeIdxLoaded = -1;

var lastQuery = null;
var resultsToRender = [];
var resultsIndex = 0;
var resultsMarkerIndex = 0;
var resultsContainer = document.getElementById("results");
var rendering = false;

var dayContainerPrototype = document.createElement("DIV");
dayContainerPrototype.classList.add("dayContainer");

var dayNamePrototype = document.createElement("SPAN");
dayNamePrototype.classList.add("dayName");
dayContainerPrototype.appendChild(dayNamePrototype);

var markerListPrototype = document.createElement("DIV");
markerListPrototype.classList.add("markerList");
dayContainerPrototype.appendChild(markerListPrototype);

var markerPrototype = document.createElement("A");
markerPrototype.classList.add("marker");
markerPrototype.setAttribute("target", "_blank");

var highlightPrototype = document.createElement("B");

var fileList = [];

var episodes = [];

function getEpisodeName(filename) {
    // NOTE(agartner): Expected filename with extension
    var day = filename.slice(0, filename.indexOf("."));
    var dayParts = day.match(/([a-zA-Z_-]+)([0-9]+)?([a-zA-Z]+)?/);
    day = dayParts[1].slice(0, 1).toUpperCase() + dayParts[1].slice(1) + (dayParts[2] ? " " + dayParts[2] : "") + (dayParts[3] ? " " + dayParts[3].toUpperCase() : "");
    return day;
}

function getPartialPath(filepath) {
    var result = filepath.slice(filepath.lastIndexOf("/", filepath.lastIndexOf("/") - 1) + 1)
    result = result.slice(0, result.indexOf("."));
    return result;
}

function sortDays(dayA, dayB) {
    return dayB.localeCompare(dayA);
}

function fileListLoaded(data) {
    fileListsLoaded++;
    var files = [];
    for (var i = data.data.length-1; i >= 0; --i) {
        var file = data.data[i];
        files.push({
            name: file.name,
            day: getEpisodeName(file.name),
            path: "https://raw.githubusercontent.com/HandmadeCompanion/HandmadeCompanion/master/" + file.path,
            data: null
        });
    }
    fileList = fileList.concat(files);
    if (fileListsLoaded == fileListsToLoad) {
        itemsToLoad = fileList.length;
        fileList = fileList.sort(function(a, b) {
            return sortDays(a.day, b.day);
        });
        for (var i = 0; i < fileList.length; ++i) {
            addFile(fileList[i].name, fileList[i].path, i);
        }
    }
}

function episodeFileLoaded(name, filepath, idx, contents) {
    itemsLoaded++;
    if (itemsLoaded == itemsToLoad) {
        document.getElementById("loadingContainer").style.display = "none";
    } else {
        document.getElementById("loadingProgress").textContent = itemsLoaded + "/" + itemsToLoad;
    }

    var lines = contents.split("\n");
    var title = null;
    var videoId = null;
    var markers = [];
    var day = getEpisodeName(name);
    var mode = "none";
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];
        if (line == "---") {
            mode = "none";
        } else if (line.startsWith("title:")) {
            title = line.slice(7).replace(/"/g, "");
        } else if (line.startsWith("videoId:")) {
            videoId = line.slice(9).replace(/"/g, "");
        } else if (line.startsWith("markers")) {
            mode = "markers";
        } else if (mode == "markers") {
            var match = line.match(/"((\d+):)?(\d+):(\d+)": "(.+)"/);
            if (match == null) {
                console.log(name, line);
            } else {
                var totalTime = (match[2] ? parseInt(match[2], 10) : 0) * 60 * 60 + parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
                var marker = {
                    totalTime: totalTime,
                    prettyTime: markerTime(totalTime),
                    text: match[5].replace(/\\"/g, "\"")
                }
                markers.push(marker);
            }
        }
    }
    fileList[idx].data = {
        day: day,
        title: title,
        videoId: videoId,
        markers: markers,
        filename: name.slice(0, name.indexOf(".")),
        filepath: filepath,
        partial_path: getPartialPath(filepath),
    };

    dataAtIdxReady(idx);
}

function episodeFileFailed(name, filepath, idx) {
    fileList[idx].data = "failed";
    dataAtIdxReady(idx);
}

function dataAtIdxReady(idx) {
    if (idx == lastEpisodeIdxLoaded + 1) {
        var i;
        for (i = idx; fileList[i] && fileList[i].data; ++i) {
            if (fileList[i].data != "failed") {
                episodes.push(fileList[i].data);
            }
            lastEpisodeIdxLoaded = i;
        }
        runSearch();
    }
}

function addFile(name, filepath, idx) {
    var xhr = new XMLHttpRequest();
    xhr.addEventListener("load", function() {
        episodeFileLoaded(name, filepath, idx, xhr.response);
    });
    xhr.addEventListener("error", function() {
        episodeFileFailed(name, filepath, idx);
    });
    xhr.open("GET", filepath);
    xhr.setRequestHeader("Content-Type", "text/plain");
    xhr.send();
}

function markerTime(totalTime) {
    var markTime = "(";
    var hours = Math.floor(totalTime / 60 / 60);
    var minutes = Math.floor(totalTime / 60) % 60;
    var seconds = totalTime % 60;
    if (hours > 0) {
        markTime += padTimeComponent(hours) + ":";
    }

    markTime += padTimeComponent(minutes) + ":" + padTimeComponent(seconds) + ")";

    return markTime;
}

function padTimeComponent(component) {
    return (component < 10 ? "0" + component : component);
}

function runSearch() {
    var queryStr = document.getElementById("query").value;
    if (lastQuery != queryStr) {
        var oldResultsContainer = resultsContainer;
        resultsContainer = oldResultsContainer.cloneNode(false);
        oldResultsContainer.parentNode.insertBefore(resultsContainer, oldResultsContainer);
        oldResultsContainer.remove();
        resultsIndex = 0;
        resultsMarkerIndex = 0;
    }
    lastQuery = queryStr;
    resultsToRender = [];
    var numEpisodes = 0;
    var numMarkers = 0;
    var totalSeconds = 0;
    if (queryStr && queryStr.length > 0) {
        var query = new RegExp(queryStr.replace("(", "\\(").replace(")", "\\)").replace(/(^|[^\\])\\$/, "$1"), "gi");
        for (var i = 0; i < episodes.length; ++i) {
            var episode = episodes[i];
            var matches = [];
            for (var j = 0; j < episode.markers.length; ++j) {
                query.lastIndex = 0;
                var result = query.exec(episode.markers[j].text);
                if (result && result[0].length > 0) {
                    numMarkers++;
                    matches.push(episode.markers[j]);
                    if (j < episode.markers.length-1) {
                        totalSeconds += episode.markers[j+1].totalTime - episode.markers[j].totalTime;
                    }
                }
            }
            if (matches.length > 0) {
                numEpisodes++;
                resultsToRender.push({
                    query: query,
                    episode: episode,
                    matches: matches
                });
            }
        }

        if (!rendering) {
            renderResults();
        }
    }

    var totalTime = Math.floor(totalSeconds/60/60) + "h " + Math.floor(totalSeconds/60)%60 + "m " + totalSeconds%60 + "s ";

    document.getElementById("resultsSummary").textContent = "Found: " + numEpisodes + " episodes, " + numMarkers + " markers, " + totalTime + "total.";
}

function renderMatches(renderStart) {
    var query = resultsToRender[resultsIndex].query;
    var episode = resultsToRender[resultsIndex].episode;
    var matches = resultsToRender[resultsIndex].matches;
    var markerList = null;
    if (resultsMarkerIndex == 0) {
        var dayContainer = dayContainerPrototype.cloneNode(true);
        var dayName = dayContainer.children[0];
        markerList = dayContainer.children[1];
        dayName.textContent = episode.day + ": " + episode.title;
        resultsContainer.appendChild(dayContainer);
    } else {
        markerList = document.querySelector("#results > .dayContainer:nth-child(" + (resultsIndex+1) + ") .markerList");
    }

    do {
        var match = matches[resultsMarkerIndex];
        var marker = markerPrototype.cloneNode();
        var baseurl = window.annotation_viewer_base_url;
        marker.setAttribute("href", baseurl + episode.partial_path + "#" + match.totalTime);
        query.lastIndex = 0;
        var cursor = 0;
        var text = match.text;
        var result = null;
        marker.appendChild(document.createTextNode(match.prettyTime + " "));
        while (result = query.exec(text)) {
            if (result.index > cursor) {
                marker.appendChild(document.createTextNode(text.slice(cursor, result.index)));
            }
            var highlightEl = highlightPrototype.cloneNode();
            highlightEl.textContent = result[0];
            marker.appendChild(highlightEl);
            cursor = result.index + result[0].length;
        }

        if (cursor < text.length) {
            marker.appendChild(document.createTextNode(text.slice(cursor, text.length)));
        }
        markerList.appendChild(marker);
        resultsMarkerIndex++;
    } while (resultsMarkerIndex < matches.length && performance.now() - renderStart < 1);

    return resultsMarkerIndex == matches.length;
}

function renderResults() {
    if (resultsIndex < resultsToRender.length) {
        rendering = true;
        var renderStart = performance.now();
        while (resultsIndex < resultsToRender.length && performance.now() - renderStart < 1) {
            var done = renderMatches(renderStart);
            if (done) {
                resultsMarkerIndex = 0;
                resultsIndex++;
            }
        }
        requestAnimationFrame(renderResults);
    } else {
        rendering = false;
    }
}

fileListsToLoad = 3;
var script = document.createElement("SCRIPT");
script.setAttribute("src", "https://api.github.com/repos/HandmadeCompanion/HandmadeCompanion/contents/src/documents/videos/code?callback=fileListLoaded");
document.body.appendChild(script);

var script = document.createElement("SCRIPT");
script.setAttribute("src", "https://api.github.com/repos/HandmadeCompanion/HandmadeCompanion/contents/src/documents/videos/chat?callback=fileListLoaded");
document.body.appendChild(script);

var script = document.createElement("SCRIPT");
script.setAttribute("src", "https://api.github.com/repos/HandmadeCompanion/HandmadeCompanion/contents/src/documents/videos/misc?callback=fileListLoaded");
document.body.appendChild(script);

var queryEl = document.getElementById("query")
queryEl.addEventListener("input", function(ev) {
    location.hash = encodeURIComponent(queryEl.value);
    runSearch();
});

runSearch();
