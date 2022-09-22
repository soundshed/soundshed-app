import envSettings from "../env";

const openLink = (e, linkUrl) => {
    e.preventDefault();
    // open link...
};

const getAppVersion = () => {
    return envSettings.Version;
}

export { openLink, getAppVersion };
