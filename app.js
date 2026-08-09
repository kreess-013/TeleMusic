// ===============================
// DEMO MUSIC
// ===============================

const tracks = [
    {
        id: 1,
        title: "Blinding Lights",
        artist: "The Weeknd",
        cover: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg"
    },

    {
        id: 2,
        title: "Starboy",
        artist: "The Weeknd",
        cover: "https://i.ytimg.com/vi/34Na4j8AVgA/hqdefault.jpg"
    },

    {
        id: 3,
        title: "Save Your Tears",
        artist: "The Weeknd",
        cover: "https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg"
    },

    {
        id: 4,
        title: "Shape of You",
        artist: "Ed Sheeran",
        cover: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg"
    },

    {
        id: 5,
        title: "Believer",
        artist: "Imagine Dragons",
        cover: "https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg"
    }
];


// ===============================
// LOCAL STORAGE
// ===============================

let favorites =
    JSON.parse(localStorage.getItem("favorites")) || [];

let currentTrack = null;

let isPlaying = false;


// ===============================
// ELEMENTS
// ===============================

const trackList =
    document.getElementById("trackList");

const favoritesList =
    document.getElementById("favoritesList");

const favoritesCount =
    document.getElementById("favoritesCount");

const emptyFavorites =
    document.getElementById("emptyFavorites");

const player =
    document.getElementById("player");

const playerCover =
    document.getElementById("playerCover");

const playerTitle =
    document.getElementById("playerTitle");

const playerArtist =
    document.getElementById("playerArtist");

const playerFavorite =
    document.getElementById("playerFavorite");

const playBtn =
    document.getElementById("playBtn");

const searchInput =
    document.getElementById("searchInput");

const nextBtn =
    document.getElementById("nextBtn");

const prevBtn =
    document.getElementById("prevBtn");


// ===============================
// RENDER TRACKS
// ===============================

function renderTracks(list = tracks) {

    trackList.innerHTML = "";

    list.forEach(track => {

        const element =
            createTrackElement(track);

        trackList.appendChild(element);

    });
}


// ===============================
// CREATE TRACK ELEMENT
// ===============================

function createTrackElement(track) {

    const div =
        document.createElement("div");

    div.className = "track";


    const isFavorite =
        favorites.includes(track.id);


    div.innerHTML = `
        <img
            class="cover"
            src="${track.cover}"
            alt="${track.title}"
        >

        <div class="track-info">

            <div class="track-title">
                ${track.title}
            </div>

            <div class="track-artist">
                ${track.artist}
            </div>

        </div>

        <button
            type="button"
            class="favorite-btn ${isFavorite ? "active" : ""}"
        >
            ${isFavorite ? "♥" : "♡"}
        </button>
    `;


    // ===========================
    // PLAY TRACK
    // ===========================

    div.addEventListener("click", event => {

        if (
            event.target.closest(".favorite-btn")
        ) {
            return;
        }

        playTrack(track);

    });


    // ===========================
    // FAVORITE BUTTON
    // ===========================

    const favoriteButton =
        div.querySelector(".favorite-btn");


    favoriteButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            toggleFavorite(track.id);

        }
    );


    return div;
}


// ===============================
// FAVORITES
// ===============================

function toggleFavorite(id) {

    if (favorites.includes(id)) {

        favorites =
            favorites.filter(
                trackId => trackId !== id
            );

    } else {

        favorites.push(id);

    }


    // Save

    localStorage.setItem(
        "favorites",
        JSON.stringify(favorites)
    );


    // Update main list

    renderTracks(
        searchInput.value
            ? filterTracks(searchInput.value)
            : tracks
    );


    // Update favorites

    renderFavorites();


    // Update player

    updatePlayerFavorite();
}


// ===============================
// RENDER FAVORITES
// ===============================

function renderFavorites() {

    favoritesList.innerHTML = "";


    const favoriteTracks =
        tracks.filter(track =>
            favorites.includes(track.id)
        );


    // Count

    favoritesCount.textContent =
        `${favoriteTracks.length} треков`;


    // Empty state

    emptyFavorites.style.display =
        favoriteTracks.length
            ? "none"
            : "block";


    // Render

    favoriteTracks.forEach(track => {

        favoritesList.appendChild(
            createTrackElement(track)
        );

    });
}


// ===============================
// PLAYER
// ===============================

function playTrack(track) {

    currentTrack = track;

    player.classList.remove("hidden");


    playerCover.src =
        track.cover;

    playerTitle.textContent =
        track.title;

    playerArtist.textContent =
        track.artist;


    isPlaying = true;

    playBtn.textContent = "Ⅱ";


    updatePlayerFavorite();
}


// ===============================
// PLAYER FAVORITE
// ===============================

function updatePlayerFavorite() {

    if (!currentTrack) return;


    const favorite =
        favorites.includes(
            currentTrack.id
        );


    playerFavorite.textContent =
        favorite ? "♥" : "♡";


    playerFavorite.style.color =
        favorite
            ? "#ff4f7b"
            : "white";
}


// ===============================
// PLAYER FAVORITE BUTTON
// ===============================

playerFavorite.addEventListener(
    "click",
    () => {

        if (!currentTrack) return;

        toggleFavorite(
            currentTrack.id
        );

    }
);


// ===============================
// PLAY / PAUSE
// ===============================

playBtn.addEventListener(
    "click",
    () => {

        if (!currentTrack) return;


        isPlaying = !isPlaying;


        playBtn.textContent =
            isPlaying
                ? "Ⅱ"
                : "▶";

    }
);


// ===============================
// NEXT
// ===============================

nextBtn.addEventListener(
    "click",
    () => {

        if (!currentTrack) return;


        const index =
            tracks.findIndex(
                track =>
                    track.id === currentTrack.id
            );


        const nextIndex =
            (index + 1) % tracks.length;


        playTrack(
            tracks[nextIndex]
        );

    }
);


// ===============================
// PREVIOUS
// ===============================

prevBtn.addEventListener(
    "click",
    () => {

        if (!currentTrack) return;


        const index =
            tracks.findIndex(
                track =>
                    track.id === currentTrack.id
            );


        const previousIndex =
            (index - 1 + tracks.length)
            % tracks.length;


        playTrack(
            tracks[previousIndex]
        );

    }
);


// ===============================
// SEARCH
// ===============================

function filterTracks(query) {

    query =
        query.toLowerCase().trim();


    return tracks.filter(track =>

        track.title
            .toLowerCase()
            .includes(query)

        ||

        track.artist
            .toLowerCase()
            .includes(query)

    );
}


searchInput.addEventListener(
    "input",
    () => {

        const result =
            filterTracks(
                searchInput.value
            );


        renderTracks(result);

    }
);


// ===============================
// NAVIGATION
// ===============================

document
    .querySelectorAll(".nav-item")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const pageId =
                    button.dataset.page;


                // Hide all pages

                document
                    .querySelectorAll(".page")
                    .forEach(page => {

                        page.classList.remove(
                            "active"
                        );

                    });


                // Show selected page

                const targetPage =
                    document.getElementById(
                        pageId
                    );


                if (targetPage) {

                    targetPage.classList.add(
                        "active"
                    );

                }


                // Update navigation

                document
                    .querySelectorAll(".nav-item")
                    .forEach(item => {

                        item.classList.remove(
                            "active"
                        );

                    });


                button.classList.add(
                    "active"
                );


                // Refresh favorites

                if (
                    pageId === "favoritesPage"
                ) {

                    renderFavorites();

                }

            }
        );

    });


// ===============================
// START APPLICATION
// ===============================

renderTracks();

renderFavorites();
