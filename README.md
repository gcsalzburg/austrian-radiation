# Austrian Radiation #

The following notes are a skeleton of a longer article to be written later.

This project makes use of:

- [Open API for radiation meters across Austria](http://sfws.lfrz.at/)
- [Mapbox JS API (Leaflet)](https://www.mapbox.com/mapbox.js/api/v3.1.1/)
- [Turf.js](http://turfjs.org/docs/)
- [Martinez polygon clipping](https://github.com/w8r/martinez)

## Summary

The idea was to provide a "rainfall weather-map" style display of radiation levels across Austria. 

The key challenges were to convert a set of arbitary data points from an API into a set of isobands. This involves converting unstructured points into a structured grid, a challenge for which Turf (and most other JS libraries) do not provide a native library. Isoband algorithms such as Marching Squares will only work on a gridded, structured data set.

The transformation process for the data was as follows:

1. Read in JSON data from source API
2. Transform data (pixels to co-ordinates) and save into GeoJSON array
3. Create TIN polygons from unstructured data set
4. Overlay a structured grid across target area
5. Calculate radiation level at each structured grid point using one of various methods (vertex averaging, nearest neighbour or interpolation). Deal with points on grid outside of Austria.
6. Calculate isobands using Marching Squares algorithm across structured grid
7. Crop isobands to outline of Austria
8. Display data

## Useful links ##

Some useful resources from the production of this experiment:

### Resources ###

- http://sfws.lfrz.at/json.php

### Q&A support info ###

- Summary of interpolation of scattered data using Matlab (used as a basis for how to construct this algorithm) https://www.mathworks.com/help/matlab/math/interpolating-scattered-data.html



Links:


- https://gis.stackexchange.com/questions/76519/render-data-on-top-of-google-maps
- https://leafletjs.com/examples/choropleth/
- https://www.sitepoint.com/javascript-geospatial-advanced-maps/
- http://turfjs.org/docs#isobands

- https://gis.stackexchange.com/questions/76357/rendering-temperature-on-google-maps

More Turf related linkes:

- http://emptypipes.org/2015/07/22/contour-comparison/
- https://github.com/Turfjs/turf/issues/829
- https://joeyklee.github.io/geosandbox/hello-turf.html#section3
- https://www.mapbox.com/mapbox.js/api/v3.1.1/l-mapbox-tilelayer/
- https://github.com/RaumZeit/MarchingSquares.js
- http://turfjs.org/docs/#pointGrid

Voroni polygons:

- https://leafletjs.com/examples/choropleth/
- https://www.mapbox.com/mapbox.js/api/v3.1.1/l-map-class/
- https://leafletjs.com/examples/geojson/
