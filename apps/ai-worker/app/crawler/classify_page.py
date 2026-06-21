def classify_page(url: str, title: str, text: str) -> str:
    """
    Classify the page into a specific evidence source type based on URL and title.
    """
    value = f"{url} {title}".lower()

    if "jobs" in value or "job" in value or "stellen" in value or "vacanc" in value:
        return "website_jobs"
    if "career" in value:
        return "website_careers"
    if "case-study" in value or "case_study" in value or "customer-story" in value or "success-story" in value:
        return "website_case_study"
    if "event" in value or "conference" in value or "webinar" in value or "expo" in value or "messe" in value:
        return "website_event"
    if "directory" in value or "member" in value or "association" in value or "exhibitor" in value or "sponsor" in value:
        return "website_directory"
    if "about" in value or "company" in value:
        return "website_about"
    if "service" in value or "solution" in value:
        return "website_services"
    if "product" in value:
        return "website_product"
    if "blog" in value:
        return "website_blog"
    if "news" in value:
        return "website_news"
    if "contact" in value:
        return "website_contact"
    if "impressum" in value:
        return "website_impressum"

    return "unknown_page"
