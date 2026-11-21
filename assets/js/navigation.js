const navigation = document.getElementById("movenavbar");

navigation.innerHTML = `
  <a href="./"><img class="homeicon" src="assets/img/home_unselected.png" alt="Home"></a>
  <div class="topnavtext">
    <a href="portfolio.html">Portfolio</a>
    <a href="resume2.pdf">Resume</a>
    <a href="about.html">About</a>
    <a href="contact.html">Contact</a>
  </div>
`;

const currentPath = window.location.pathname.replace(/\/index\.html$/, "/");
const currentLink = Array.from(navigation.querySelectorAll("a"))
  .find((link) => link.pathname === currentPath);

if (currentLink) {
  currentLink.classList.add("active");
  currentLink.setAttribute("aria-current", "page");

  const homeIcon = currentLink.querySelector(".homeicon");
  if (homeIcon) {
    homeIcon.src = "assets/img/home_selected.png";
  }
}

const navToggle = document.getElementById("navhider");

navToggle.addEventListener("click", () => {
  const expanded = navToggle.getAttribute("aria-expanded") === "true";

  navToggle.setAttribute("aria-expanded", String(!expanded));
  navigation.toggleAttribute("inert", expanded);
});
