import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "./App.css";

const CreditCardDropdown = () => {
  const [creditCards, setCreditCards] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCards, setFilteredCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState("");
  const [swiggyOffers, setSwiggyOffers] = useState([]);
  const [zomatoOffers, setZomatoOffers] = useState([]);
  const [noOffersMessage, setNoOffersMessage] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Check screen width to detect if it's mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768); // You can change the width as needed
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Fetch and parse CSV files
  useEffect(() => {
    const fetchAndParseCSV = (filePath) =>
      new Promise((resolve, reject) => {
        Papa.parse(filePath, {
          download: true,
          header: true,
          complete: (results) => resolve(results.data),
          error: (error) => reject(error),
        });
      });

    const extractCreditCards = (data) => {
      const cards = [];
      data.forEach((row) => {
        const applicableCards = row["Applicable to Credit cards"];
        if (applicableCards) {
          const cardNames = applicableCards
            .split(",")
            .map((card) => card.trim().split("(")[0].trim());
          cards.push(...cardNames);
        }
      });
      return cards;
    };

    const fetchData = async () => {
      try {
        const [swiggyData, zomatoData] = await Promise.all([
          fetchAndParseCSV("/Swiggy.csv"),
          fetchAndParseCSV("/Zomato.csv"),
        ]);

        const swiggyCards = extractCreditCards(swiggyData);
        const zomatoCards = extractCreditCards(zomatoData);

        const allCards = [...swiggyCards, ...zomatoCards];
        const uniqueCards = Array.from(new Set(allCards));

        setCreditCards(uniqueCards);
        setFilteredCards(uniqueCards);
      } catch (error) {
        console.error("Error fetching or parsing CSV files:", error);
      }
    };

    fetchData();
  }, []);

  // Fetch offers based on selected card
  const fetchOffers = async (card) => {
    const fetchAndParseCSV = (filePath) =>
      new Promise((resolve, reject) => {
        Papa.parse(filePath, {
          download: true,
          header: true,
          complete: (results) => resolve(results.data),
          error: (error) => reject(error),
        });
      });

    const filterOffers = (data, card) =>
      data
        .filter((row) => row["Applicable to Credit cards"]?.includes(card))
        .map((row) => ({
          offer: row["Offer"],
          coupon: row["Coupon code"],
        }));

    try {
      const [swiggyData, zomatoData] = await Promise.all([
        fetchAndParseCSV("/Swiggy.csv"),
        fetchAndParseCSV("/Zomato.csv"),
      ]);

      const swiggyFiltered = filterOffers(swiggyData, card);
      const zomatoFiltered = filterOffers(zomatoData, card);

      setSwiggyOffers(swiggyFiltered);
      setZomatoOffers(zomatoFiltered);

      if (swiggyFiltered.length === 0 && zomatoFiltered.length === 0) {
        setNoOffersMessage("No offers found for this card.");
      } else {
        setNoOffersMessage("");
      }
    } catch (error) {
      console.error("Error fetching or filtering offers:", error);
    }
  };

  // Handle search input
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (value === "") {
      setFilteredCards([]);
      setNoOffersMessage("");
      setSelectedCard("");
      setSwiggyOffers([]);
      setZomatoOffers([]);
      return;
    }

    const matchingCards = creditCards.filter((card) =>
      card.toLowerCase().startsWith(value.toLowerCase())
    );
    setFilteredCards(matchingCards);

    if (matchingCards.length === 0) {
      setNoOffersMessage("No offers found for this card.");
    } else {
      setNoOffersMessage("");
    }
  };

  // Handle card selection
  const handleCardSelect = (card) => {
    setSelectedCard(card);
    setSearchTerm(card);
    setFilteredCards([]);
    fetchOffers(card);
  };

  return (
    <div className="container">
      {/* Navbar Component */}
      <nav style={styles.navbar}>
        <div style={styles.logoContainer}>
          <a href="https://www.myrupaya.in/">
            <img
              src="https://static.wixstatic.com/media/f836e8_26da4bf726c3475eabd6578d7546c3b2~mv2.jpg/v1/crop/x_124,y_0,w_3152,h_1458/fill/w_909,h_420,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/dark_logo_white_background.jpg"
              alt="MyRupaya Logo"
              style={styles.logo}
            />
          </a>
          <div style={styles.linksContainer}>
            <a href="https://www.myrupaya.in/" style={styles.link}>
              Home
            </a>
          </div>
        </div>
      </nav>

      <h1>Offers on Zomato and Swiggy</h1>

      <div className="main" style={styles.main}>
        <div className="search-dropdown">
        <input
  id="creditCardSearch"
  type="text"
  value={searchTerm}
  onChange={handleSearchChange}
  placeholder="Type to search..."
  className="search-input"
  style={{
    ...styles.searchInput,
    maxWidth: isMobile ? "500px" : "1000px", // Apply mobile or desktop width
  }}
/>

{filteredCards.length > 0 && (
  <ul
    className="dropdown-list"
    style={{
      ...styles.dropdownList,
      maxWidth: isMobile ? "200px" : "1000px", // Apply mobile or desktop width
    }}
  >
    {filteredCards.map((card, index) => (
      <li
        key={index}
        className="dropdown-item"
        onClick={() => handleCardSelect(card)}
        style={styles.dropdownItem}
      >
        {card}
      </li>
    ))}
  </ul>
)}

        </div>

        {noOffersMessage && (
          <p className="no-offers-message" style={{ color: "red", textAlign: "center" }}>
            {noOffersMessage}
          </p>
        )}

        {selectedCard && !noOffersMessage && (
          <div className="offers-section">
            {zomatoOffers.length > 0 && (
              <div>
                <h2 className="offers-heading">Offers on Zomato</h2>
                <div className="offers-cards-container">
                  {zomatoOffers.map((offer, index) => (
                    <div key={index} className="offer-card">
                      <p>
                        <strong>Offer:</strong> {offer.offer}
                      </p>
                      <p>
                        <strong>Coupon Code:</strong> {offer.coupon}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {swiggyOffers.length > 0 && (
              <div>
                <h2 className="offers-heading">Offers on Swiggy</h2>
                <div className="offers-cards-container">
                  {swiggyOffers.map((offer, index) => (
                    <div key={index} className="offer-card">
                      <p>
                        <strong>Offer:</strong> {offer.offer}
                      </p>
                      <p>
                        <strong>Coupon Code:</strong> {offer.coupon}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    backgroundColor: "#CDD1C1",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
  },
  logo: {
    width: "100px",
    height: "100px",
    marginRight: "20px",
  },
  linksContainer: {
    display: "flex",
    gap: "35px",
    flexWrap: "wrap",
    marginLeft: "40px", // Adjust spacing from the logo
  },
  link: {
    textDecoration: "none",
    color: "black",
    fontSize: "18px", // Increased font size
    fontFamily: "Arial, sans-serif",
    transition: "color 0.3s ease", // Smooth transition effect
  },
  main: {
    display: "flex",
    alignItems: "center",
    height: "80vh", // Take up 80% of the screen height
    flexDirection: "column",
  },
 
};

export default CreditCardDropdown;
