# Austrian Radiation #

The following notes are a skeleton of a longer article to be written later.

This project makes use of:

- [Open API for radiation meters across Austria](http://sfws.lfrz.at/)
- [Mapbox JS API (Leaflet)](https://www.mapbox.com/mapbox.js/api/v3.1.1/)
- [Turf.js](http://turfjs.org/docs/)
- [Martinez polygon clipping](https://github.com/w8r/martinez)

## Summary ##

The idea was to provide a "rainfall weather-map" style display of radiation levels across Austria. 

The key challenges were to convert a set of arbitary data points from an API into a set of isobands. This involves converting unstructured points into a structured grid, a challenge for which Turf (and most other JS libraries) do not provide a native library. This is not an [uncommon challenge](https://gis.stackexchange.com/questions/76357/rendering-temperature-on-google-maps)! Isoband algorithms such as Marching Squares will only work on a gridded, structured data set. The GeoJSON format was used throughout. 

The transformation process for the data was as follows:

1. Read in JSON data from source API
2. Transform data (pixels to co-ordinates) and save into GeoJSON array
5. Calculate radiation level at each structured grid point across target area using one of various methods:
   1. Nearest neighbour (iteration over unstructured grid)
   2. Vertex averaging (create TIN polygons and average corner points)
   3. Interpolation (using turf/interpolate)
4. Deal with points on grid outside of Austria.
6. Calculate isobands using Marching Squares algorithm across structured grid
7. Crop isobands to outline of Austria
8. Display data

## Useful links ##

Some useful resources from the production of this experiment:

### Resources & docs ###

- http://sfws.lfrz.at/json.php
- https://github.com/Turfjs/turf
- https://leafletjs.com/examples/geojson/
- Comparison of isoband algorithms http://emptypipes.org/2015/07/22/contour-comparison/
- Marching Squares implementation (not used in the end in favour of the Turf.js native implementation) https://github.com/RaumZeit/MarchingSquares.js
- Comparison of different intersect function speeds https://polygon-clipping.js.org/
- Useful GeoJSON/Turf examples https://joeyklee.github.io/geosandbox/hello-turf.html

### Q&A support info ###

- Summary of interpolation of scattered data using Matlab (used as a basis for how to construct this algorithm) https://www.mathworks.com/help/matlab/math/interpolating-scattered-data.html
- How to add different styles and events to items in a FeatureCollection https://leafletjs.com/examples/choropleth/

## Other useful notes ##

Turf.js docs can be usefully supplemented with notes on each individual package page.

Turf intersect did not work reliably on MultiPolygons, hence Martinez was used. Another option would have been to [iterate over and split the shape into multiple Polygons](https://gis.stackexchange.com/questions/121396/convert-multipolygon-geojson-to-multiple-geojson-polygons) but this didn't seem very efficient!

Always read the Github issues and docs - you find things not yet in the official documentation! (e.g: https://github.com/Turfjs/turf/issues/1031). Although using a grid mask on the interpolate options didn't work, since the function snaps to the size of the data. So we need some fake data points!

Stupid ordering!! https://macwright.org/lonlat/